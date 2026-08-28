#------------------------------------------------------------------------------
# Wood Products Carbon Tracker - Parameter generator + sensitivity on real data
#  * generate_params : key inputs (service life) -> a full, coupled parameter file
#  * run_point       : run the FULL tracker once on real input data with a list of
#                      parameter modifications. The front end loops this to build the
#                      response curve, the tornado chart, and the uncertainty band.
#------------------------------------------------------------------------------
import math
import pandas as pd
import WPsCT_Functions as wf
import WPsCT_Main as wm

EXP_SQRT2PI = math.exp(math.sqrt(2 * math.pi))   # links disposal_1 to the peak disposal rate
PRODUCTS = ['Construction', 'Exterior', 'Household', 'Graphic Paper', 'Other Paper', 'Household Paper']
LF_TURN  = ['con_decay2', 'ext_decay2', 'hou_decay2', 'pap_decay2']
_WORK = '/tmp'


def _gp(para, prod, var, default=None):
    r = para.loc[(para['Product'] == prod) & (para['Variable'] == var), 'Parameter']
    return float(r.values[0]) if len(r) else default


def bell_area(dp2, dp3):
    """Area under exp(-dp2 * (t - dp3)^2 / dp3) for ages t >= 0."""
    sd = math.sqrt(dp3 / (2.0 * dp2))
    return sd * math.sqrt(2.0 * math.pi) * 0.5 * (1.0 + math.erf((dp3 / sd) / math.sqrt(2.0)))


def couple_service_life(para, prod, L):
    """Service half-life L -> coupled (dp1, dp2, dp3) for the disposal bell curve.

    The width keeps the product's default spread-to-life ratio. The height is then
    set so the curve integrates to exactly 1 over ages 0..infinity, which is what
    keeps carbon conserved. Every product uses this one form, so regenerating with
    the default service lives reproduces WPs_Tracker_paras.csv.
    """
    d2 = _gp(para, prod, 'disposal_2', 0.0)
    d3 = _gp(para, prod, 'disposal_3', L)
    L  = max(float(L), 1e-6)
    if not d2 or d2 <= 0 or not d3 or d3 <= 0:
        d2, d3 = 0.5, 1.0                    # fallback: spread equal to the service life
    dp2 = float(d2) * float(d3) / L          # same spread-to-life ratio as the default
    dp1 = EXP_SQRT2PI / bell_area(dp2, L)   # height that makes the area exactly 1
    return dp1, dp2, L


def generate_params(para, service_lives):
    """Return a FULL parameter table (records) with disposal params re-derived from the
       given service lives. service_lives: {product: L}. Other rows are kept as-is."""
    p = para.copy()
    for prod, L in service_lives.items():
        if L is None:
            continue
        d1, d2, d3 = couple_service_life(para, prod, float(L))
        for var, val in [('disposal_1', d1), ('disposal_2', d2), ('disposal_3', d3)]:
            m = (p['Product'] == prod) & (p['Variable'] == var)
            if m.any():
                p.loc[m, 'Parameter'] = val
    p['Parameter'] = p['Parameter'].astype(float)
    return p[['Product', 'Variable', 'Parameter']].to_dict('records')


def _records_to_df(records):
    return pd.DataFrame(records, columns=['Product', 'Variable', 'Parameter'])


def modified_para(base, spec, value):
    """Apply one parameter change. spec:
         'sl:<product>'  -> set that product's service half-life = value (years)
         'sl:all'        -> scale ALL service lives by `value`
         'rec:all'       -> scale recycling rate (recycle_1) by `value`
         'lf:all'        -> scale landfill turnover (decay2) by `value`"""
    p = base.copy()
    def setv(prod, var, val):
        m = (p['Product'] == prod) & (p['Variable'] == var)
        if m.any():
            p.loc[m, 'Parameter'] = val
    kind, target = spec.split(':', 1)
    if kind == 'sl':
        prods = PRODUCTS if target == 'all' else [target]
        for prod in prods:
            L0 = _gp(base, prod, 'disposal_3')
            if L0 is None:
                continue
            L = (L0 * value) if target == 'all' else value
            d1, d2, d3 = couple_service_life(base, prod, L)
            setv(prod, 'disposal_1', d1); setv(prod, 'disposal_2', d2); setv(prod, 'disposal_3', d3)
    elif kind == 'rec':
        for prod in PRODUCTS:
            r0 = _gp(base, prod, 'recycle_1')
            if r0 is not None:
                setv(prod, 'recycle_1', min(1.0, r0 * value))
    elif kind == 'lf':
        for var in LF_TURN:
            v0 = _gp(base, 'Landfill', var)
            if v0 is not None:
                setv('Landfill', var, v0 * value)
    elif kind == 'recabs':
        for prod in PRODUCTS:
            if _gp(base, prod, 'recycle_1') is not None:
                setv(prod, 'recycle_1', min(1.0, max(0.0, value)))
    elif kind == 'lfabs':
        for var in LF_TURN:
            if _gp(base, 'Landfill', var) is not None:
                setv('Landfill', var, value)
    return p


def run_total(data_path, para_df):
    """Run the full tracker on `data_path` with `para_df`; return (years, total_stored[]).
       Total stored carbon = sum(all in-use pools) + landfill stock + biochar stock."""
    pp = _WORK + '/_sens_para.csv'; op = _WORK + '/_sens_out.csv'
    para_df.to_csv(pp, index=False)
    wm.tracker(data_path, pp, op)
    out = pd.read_csv(op)
    out = out[out['Year'].notna()].reset_index(drop=True)
    inuse_cols = [c for c in out.columns if c.endswith('_InUse')]
    total = out[inuse_cols].sum(axis=1)
    if 'LF_Stock_Total' in out.columns: total = total + out['LF_Stock_Total'].fillna(0)
    if 'Biochar_Stock'  in out.columns: total = total + out['Biochar_Stock'].fillna(0)
    return out['Year'].tolist(), [float(x) for x in total]


def run_point(data_path, para_records, mods):
    """One tracker run: apply a list of [spec, value] modifications in order, then return
       the total-stored-carbon path. Lets the front end drive the loop (progress + yielding)."""
    p = _records_to_df(para_records)
    for spec, value in mods:
        p = modified_para(p, spec, value)
    yrs, tot = run_total(data_path, p)
    return {'years': yrs, 'total': tot, 'final': tot[-1]}
