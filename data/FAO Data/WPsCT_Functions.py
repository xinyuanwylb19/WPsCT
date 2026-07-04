#------------------------------------------------------------------------------
# Wood Products Carbon Tracker - Functions
# Single module with every pipeline function:
#   1) tracker carbon-flux math, 2) FAOSTAT -> per-country input converter,
#   3) the country tracker and batch runner.
# Run the pipeline through WPsCT_Data_Generator.py. All parameters live in
# WPs_Tracker_paras.csv.
# author: xinyuan.wei
#------------------------------------------------------------------------------
import math
import pandas as pd
from pathlib import Path

# SciPy fallback: provide a simple trapezoidal integrator if SciPy is unavailable (browser Pyodide)
try:
    import scipy.integrate as integrate
except Exception:
    class _IntegrateFallback:
        @staticmethod
        def quad(func, a, b, **kwargs):
            # simple trapezoidal rule
            if b <= a:
                return (0.0, 0.0)
            # adaptive number of steps based on interval length
            n = max(200, int((b - a) * 50))
            h = (b - a) / n
            s = 0.5 * (func(a) + func(b))
            x = a + h
            for _ in range(1, n):
                s += func(x)
                x += h
            return (s * h, 0.0)
    integrate = _IntegrateFallback()

#------------------------------------------------------------------------------
# Biofuel carbon flux (charcoal + emissions)
def biofuel_CF(years, fuel, efficiency):

    fuel = pd.Series(fuel, dtype=float).reset_index(drop=True)
    charcoal_inflow = pd.Series(index=range(years), dtype=float) 
    emissions = pd.Series(index=range(years), dtype=float)
    
    for i in range(years):
        f = float(fuel.iat[i] if i < len(fuel) else 0.0)
        ch = (1.0 - efficiency) * f
        em = efficiency * f
        charcoal_inflow.iat[i] = ch
        emissions.iat[i] = em
        
    return charcoal_inflow, emissions
#------------------------------------------------------------------------------
# Charcoal carbon flux (pool-size based decay: dr = dc1 + dc2 * ln(stock))
def biochar_CF(years, inflow, dc1, dc2):

    inflow = pd.Series(inflow, dtype=float).reset_index(drop=True)
    stock = pd.Series(index=range(years), dtype=float)
    decay = pd.Series(index=range(years), dtype=float)
    cur_pool = 0.0
    
    for i in range(years):
        cur_pool = cur_pool + float(inflow.iat[i] if i < len(inflow) else 0.0)
        dr = dc1 + dc2 * math.log(max(cur_pool, 1e-12))
        dr = min(1.0, max(0.0, float(dr)))
        d = cur_pool * dr
        cur_pool = cur_pool - d
        stock.iat[i] = cur_pool
        decay.iat[i] = d
        
    return stock, decay

#------------------------------------------------------------------------------
# Disposal model for in-use wood products (Gaussian-like bell curve)
def disposal_rate(t, dp1, dp2, dp3):
    a = dp1 / math.exp(math.sqrt(2 * math.pi))
    b = math.exp((-dp2 * ((t - dp3) ** 2)) / max(dp3, 1e-12))
    dr = a * b
    return max(0.0, float(dr))

def disposal_CF(years, production, dp1, dp2, dp3):

    production = pd.Series(production, dtype=float).reset_index(drop=True)
    inuse = pd.Series(index=range(years), dtype=float)
    dispos = pd.Series(index=range(years), dtype=float)

    def in_use(age):
        val = 1.0 - integrate.quad(
            lambda tt: disposal_rate(tt, dp1, dp2, dp3),
            0.0, float(age)
        )[0]
        return min(1.0, max(0.0, float(val)))

    for i in range(years):
        s = 0.0
        d = 0.0
        for j in range(i + 1):
            c = float(production.iat[j] if j < len(production) else 0.0)
            age = float(i - j + 1)
            s += c * in_use(age)
            d += c * disposal_rate(age, dp1, dp2, dp3)
        inuse.iat[i] = s
        dispos.iat[i] = d

    return inuse, dispos

#------------------------------------------------------------------------------
# Recycled products carbon flux (eecycling rate: rr = rp1 + rp2 * ln(t))
def recycle_CF(years, disposals, rp1, rp2):
    
    disposals = pd.Series(disposals, dtype=float).reset_index(drop=True)
    recycled = pd.Series(index=range(years), dtype=float)
    landfill = pd.Series(index=range(years), dtype=float)

    for i in range(years):
        d = float(disposals.iat[i] if i < len(disposals) else 0.0)
        rr = float(rp1) + float(rp2) * math.log(max(i + 1.0, 1e-12))
        rr = min(1.0, max(0.0, rr))
        r = rr * d
        recycled.iat[i] = r
        landfill.iat[i] = d - r
        
    return recycled, landfill

#------------------------------------------------------------------------------
# Landfill carbon flux (Decay rate: l(t) = log(t) * k1 / (k2 * sqrt(2*pi)))
def survive(t, k1, k2):
    if k2 <= 0:
        raise ValueError("k2 must be > 0")
    if t <= 0:
        return 1.0
    z = (math.log(t) - k1) / k2
    Phi = 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))
    S = 1.0 - Phi
    if S < 0.0: 
        return 0.0
    if S > 1.0: 
        return 1.0
    return S

def landfill_CF(years, landfill_input, k1, k2):
    
    landfill_input = pd.Series(landfill_input, dtype=float).reset_index(drop=True)
    n_in = len(landfill_input)
    arr = [float(landfill_input.iat[i]) if i < n_in else 0.0 for i in range(n_in)]

    # Precompute survival for ages 0..years
    S = [survive(a, k1, k2) for a in range(n_in + 1)]

    landfill_pool = [0.0] * n_in
    landfill_decayed = [0.0] * n_in

    for i in range(n_in):
        s = 0.0
        # Cohorts 0..i, age at end of year i is (i+1-j)
        for j in range(i + 1):
            age = i + 1 - j
            s += arr[j] * S[age]
        landfill_pool[i] = s

    prev = 0.0
    for i in range(n_in):
        inc = arr[i]
        dec = (prev + inc) - landfill_pool[i]
        landfill_decayed[i] = 0.0 if dec < 0.0 and dec > -1e-12 else max(0.0, dec)
        prev = landfill_pool[i]

    return landfill_pool, landfill_decayed


#==============================================================================
# FAOSTAT wide-format  ->  per-country WPsCT input files (consumption / production)
#==============================================================================
# ------------------------------------------------------------------------------
# File Information
# ------------------------------------------------------------------------------
FAO_CSV    = "Forestry_E_All_Data/Forestry_E_All_Data.csv"
OUTPUT_DIR = "WPsCT_Input"

# Set to a list of country names to process only specific countries, e.g.:
#   COUNTRIES = ["Canada", "Brazil", "China, mainland"]
# Set to None to process ALL countries in the file
COUNTRIES = None

# ------------------------------------------------------------------------------
# Country Classification
# ------------------------------------------------------------------------------
# Countries are classified into three groups that determine end-use allocation.
# Countries NOT listed below default to EMERGING parameters.

DEVELOPED_COUNTRIES = {
    # North America
    "United States of America", "Canada",
    # Western Europe
    "Austria", "Belgium", "Belgium-Luxembourg", "Denmark", "Finland",
    "France", "Germany", "Greece", "Iceland", "Ireland", "Italy",
    "Luxembourg", "Netherlands (Kingdom of the)", "Norway", "Portugal",
    "Spain", "Sweden", "Switzerland",
    "United Kingdom of Great Britain and Northern Ireland",
    # Eastern / Southern Europe (EU)
    "Bulgaria", "Croatia", "Czechia", "Czechoslovakia", "Estonia",
    "Hungary", "Latvia", "Lithuania", "Poland", "Romania", "Slovakia",
    "Slovenia", "Malta", "Cyprus",
    # South-East Europe / former Yugoslavia
    "North Macedonia", "Montenegro", "Serbia", "Serbia and Montenegro",
    "Bosnia and Herzegovina", "Albania", "Yugoslav SFR",
    # Former Soviet / Eastern Europe
    "Belarus", "Ukraine", "Russian Federation", "USSR",
    "Republic of Moldova", "Georgia", "Armenia", "Azerbaijan",
    # East Asia (high income)
    "Japan", "Republic of Korea",
    # Oceania
    "Australia", "New Zealand",
    # Other high-income
    "Israel", "Singapore",
    # Baltic / Nordic
    "Faroe Islands", "Greenland",
}

TROPICAL_DEVELOPING_COUNTRIES = {
    # Sub-Saharan Africa
    "Nigeria", "Ethiopia", "Ethiopia PDR",
    "Democratic Republic of the Congo", "Congo",
    "United Republic of Tanzania", "Kenya", "Uganda", "Ghana",
    "Cameroon", "Côte d'Ivoire", "Angola", "Mozambique", "Madagascar",
    "Zambia", "Zimbabwe", "Senegal", "Mali", "Burkina Faso", "Niger",
    "Chad", "Benin", "Rwanda", "Burundi", "Malawi", "Sierra Leone",
    "Togo", "Liberia", "Central African Republic", "Gabon",
    "Equatorial Guinea", "Botswana", "Namibia", "Lesotho", "Eswatini",
    "Djibouti", "Somalia", "Eritrea", "South Sudan", "Guinea",
    "Guinea-Bissau", "Sudan", "Sudan (former)", "South Africa",
    "Cabo Verde", "Comoros", "Sao Tome and Principe",
    "Seychelles", "Mauritius", "Réunion", "Mayotte",
    # South Asia
    "India", "Bangladesh", "Pakistan", "Sri Lanka", "Nepal",
    # South-East Asia (developing)
    "Myanmar", "Cambodia", "Lao People's Democratic Republic",
    "Timor-Leste", "Papua New Guinea",
    # Pacific Islands
    "Solomon Islands", "Fiji", "Vanuatu", "Samoa",
    "Kiribati", "Tonga", "Nauru", "Tuvalu", "Palau",
    "Micronesia (Federated States of)", "Marshall Islands",
    # Central America & Caribbean (lower income)
    "Haiti", "Guatemala", "Honduras", "Nicaragua", "Belize",
    # Other
    "Afghanistan", "Yemen", "Bhutan",
    "Least Developed Countries (LDCs)",
    "Land Locked Developing Countries (LLDCs)",
}

# All other countries (not in either set above) default to EMERGING:
# China, Brazil, Mexico, Indonesia, Malaysia, Thailand, Viet Nam,
# Philippines, Turkey, Iran, Saudi Arabia, UAE, Egypt, Morocco,
# Argentina, Chile, Colombia, etc.


def get_country_group(country_name: str) -> str:
    """Return 'developed', 'emerging', or 'tropical_developing' for a country."""
    if country_name in DEVELOPED_COUNTRIES:
        return "developed"
    if country_name in TROPICAL_DEVELOPING_COUNTRIES:
        return "tropical_developing"
    return "emerging"


# ------------------------------------------------------------------------------
# Base conversion parameters (shared across all groups)
# ------------------------------------------------------------------------------
# All numeric parameters now live in WPs_Tracker_paras.csv (single source of truth):
#   Product = "Conversion"  -> carbon fractions, densities, retentions  (ParameterSet "all")
#   Product = "Allocation"  -> end-use allocation fractions             (ParameterSet = country group)
# (Tracker disposal/recycling/landfill parameters are in the same file, read by the tracker / run_all_countries in this file.)

PARAM_FILE    = Path(__file__).resolve().parent / "WPs_Tracker_paras.csv"
_PARAMS_CACHE = None


def _load_conversion_params(path=PARAM_FILE):
    """Read base conversion + per-group allocation parameters from WPs_Tracker_paras.csv."""
    global _PARAMS_CACHE
    if _PARAMS_CACHE is None:
        df = pd.read_csv(path)
        base, groups = {}, {}
        for _, row in df.iterrows():
            product  = str(row["Product"]).strip()
            variable = str(row["Variable"]).strip()
            try:
                value = float(row["Parameter"])
            except (TypeError, ValueError):
                continue
            if product == "Conversion":
                base[variable] = value
            elif product == "Allocation":
                groups.setdefault(str(row["ParameterSet"]).strip(), {})[variable] = value
        _PARAMS_CACHE = (base, groups)
    return _PARAMS_CACHE


def get_params(country_name: str) -> dict:
    """Return the full parameter dict for a country (base conversion + group allocation)."""
    base, groups = _load_conversion_params()
    group  = get_country_group(country_name)
    params = dict(base)
    params.update(groups.get(group, {}))
    params["country_group"] = group
    return params


# ------------------------------------------------------------------------------
# Item to WPsCT Category Name
# ------------------------------------------------------------------------------
# FAO forestry data includes BOTH specific sub-items AND aggregate totals for
# the same product groups.  When both are present in the same country-year,
# naively summing them causes double- or triple-counting.
#
# This mapping uses a three-tier fallback system:
#
#   Tier 1 – SPECIFIC items: always processed, mark their category as "covered"
#   Tier 2 – SUB-AGGREGATE items: processed only if Tier-1 coverage absent
#   Tier 3 – FULL-AGGREGATE items: processed only if no Tier-1 or Tier-2 coverage
#
# Special internal categories (resolved inside process_country):
#   _SAW             : specific sawnwood (con / non-con)
#   _SAW_AGG         : "Sawnwood" aggregate → only if no _SAW for that year
#   _PANEL           : specific panel items (plywood, OSB, MDF, etc.)
#   _PANEL_FB        : specific fibreboard sub-items (Hardboard, MDF, Other)
#   _PANEL_FB_AGG    : "Fibreboard" aggregate → only if no _PANEL_FB
#   _PANELS_AGG      : "Wood-based panels" aggregate → only if no _PANEL
#   _OIR             : other industrial roundwood (Ext/Hh split)
#   _PW_SPECIFIC     : specific P&W sub-items (coated, mech, woodfree)
#   _PW_AGG          : "Printing and writing papers" → only if no _PW_SPECIFIC
#   _GRAPHIC_AGG     : "Graphic papers" → only if no P&W at all
#   _OTHPAP_AGG      : "Other paper and paperboard" → only if no specific Other Paper
#   _PAPER_AGG       : "Paper and paperboard" → lowest fallback
#
# Unit tags:
#   m3_soft    -> m3 coniferous wood  (density_softwood)
#   m3_hard    -> m3 non-coniferous   (density_hardwood)
#   m3_mixed   -> m3 unknown species  (density_mixed)
#   m3_eng     -> m3 engineered wood  (density_engineered x retention_engineered)
#   m3_ply     -> m3 plywood/veneer   (density_mixed x retention_plywood)
#   m3_pb      -> m3 particle board   (density_particleboard x retention_pb)
#   m3_fb      -> m3 fibreboard       (density_fibreboard x retention_fb)
#   m3_panels  -> m3 panels aggregate (density_panels_aggregate x retention)
#   t_dry      -> tonnes dry biomass  (x 1000 x carbon_fraction_wood)
#   t_charcoal -> tonnes charcoal     (x 1000 x cf_charcoal x biochar_stable)
#   t_pw / t_np / t_pkg / t_hp / t_oth / t_graphic / t_paper -> paper types

ITEM_MAP = {

    # ------------------------------------------------------------------
    # Engineered structural wood – always Construction
    # ------------------------------------------------------------------
    "Glue-laminated timber (glulam)":        ("Construction", "m3_eng"),
    "Cross-laminated timber (CLT or X-lam)": ("Construction", "m3_eng"),
    "Laminated Veneer Lumber (LVL)":         ("Construction", "m3_eng"),
    "I-beams (I-joists)":                    ("Construction", "t_dry"),

    # ------------------------------------------------------------------
    # Sawnwood – specific items only (Tier 1).
    # The "Sawnwood" aggregate equals the sum of specific items in FAO;
    # including it alongside specific items causes double-counting.
    # "Sawnwood" aggregate is handled as a Tier-2 fallback in
    # process_country (used only when specific items are absent).
    # ------------------------------------------------------------------
    "Sawnwood, coniferous":     ("_SAW", "m3_soft"),
    "Sawnwood, non-coniferous": ("_SAW", "m3_hard"),
    # "Sawnwood" (aggregate) → Tier-2 fallback in process_country

    # ------------------------------------------------------------------
    # Wood-based panels – specific items only, split by type (Tier 1).
    #
    # Non-fibreboard panels (→ _PANEL, populates panel_specific):
    #   Plywood/LVL, Veneer, Particle board, OSB, old PB+OSB aggregate
    # Fibreboard sub-items (→ _PANEL_FB, populates fb_specific + panel_specific):
    #   "Fibreboard, compressed (1961-1994)" covers the pre-1995 era;
    #   MDF/HDF, Hardboard, Other fibreboard cover 1995-present.
    #   Their sum always equals the "Fibreboard" aggregate in FAO data.
    # "Fibreboard" aggregate → Tier-2 fallback (only when no fb_specific)
    # "Wood-based panels" aggregate → Tier-3 fallback (only when no panel_specific)
    # ------------------------------------------------------------------
    "Plywood and LVL":                               ("_PANEL", "m3_ply"),
    "Veneer sheets":                                 ("_PANEL", "m3_ply"),
    "Particle board":                                ("_PANEL", "m3_pb"),
    "Oriented strand board (OSB)":                   ("_PANEL", "m3_pb"),
    "Particle board and OSB (1961-1994)":            ("_PANEL", "m3_pb"),
    # Fibreboard sub-items (→ _PANEL_FB so fb_specific is populated)
    "Medium/high density fibreboard (MDF/HDF)":      ("_PANEL_FB", "m3_fb"),
    "Hardboard":                                     ("_PANEL_FB", "m3_fb"),
    "Other fibreboard":                              ("_PANEL_FB", "m3_fb"),
    "Fibreboard, compressed (1961-1994)":            ("_PANEL_FB", "m3_fb"),
    # "Fibreboard" (aggregate) → Tier-2 fallback in process_country
    # "Wood-based panels" (full aggregate) → Tier-3 fallback in process_country

    # ------------------------------------------------------------------
    # Exterior
    # ------------------------------------------------------------------
    "Recovered post-consumer wood":  ("Exterior", "t_dry"),

    # ------------------------------------------------------------------
    # Other Industrial Roundwood – split Exterior / Household
    #
    # The "Other industrial roundwood" aggregate tracks full net consumption
    # (production + imports − exports) and is the preferred source.
    # Species-specific items only track production (no trade adjustment),
    # so their sum equals the aggregate's production component only.
    # Including both causes double-counting.
    #
    # Strategy (Tier 1 → Tier 2):
    #   Tier 1: "Other industrial roundwood" aggregate (full consumption)
    #   Tier 2: specific production items + old trade item (fallback when
    #           aggregate is absent for a given country-year)
    # ------------------------------------------------------------------
    "Other industrial roundwood":  ("_OIR", "m3_mixed"),
    # Tier-2 OIR fallbacks (handled in process_country):
    # "Other industrial roundwood, coniferous (production)"
    # "Other industrial roundwood, non-coniferous (production)"
    # "Other industrial roundwood, all species (export/import, 1961-1989)"

    # ------------------------------------------------------------------
    # Graphic Paper  (longer-lived: books, files, reference materials)
    #
    # Paper hierarchy uses a fallback system (handled in process_country):
    #   Tier 1: specific P&W sub-items (coated, mech, wf) always processed
    #   Tier 2: "Printing and writing papers" aggregate → only when no Tier-1
    #   Tier 3: "Graphic papers" aggregate → only when no Tier-1 or Tier-2
    # This prevents double-counting when FAO reports both aggregate and sub-items.
    # ------------------------------------------------------------------
    "Printing and writing papers, coated":               ("_PW_SPECIFIC", "t_pw"),
    "Printing and writing papers, uncoated, mechanical": ("_PW_SPECIFIC", "t_pw"),
    "Printing and writing papers, uncoated, woodfree":   ("_PW_SPECIFIC", "t_pw"),
    # "Printing and writing papers" (aggregate) → handled as _PW_AGG fallback
    # "Graphic papers" (full aggregate) → handled as _GRAPHIC_AGG fallback

    # ------------------------------------------------------------------
    # Household Paper
    # ------------------------------------------------------------------
    "Household and sanitary papers": ("Household Paper", "t_hp"),

    # ------------------------------------------------------------------
    # Other Paper – short-lived packaging + newsprint
    #
    # Packaging hierarchy:
    #   Tier 1 aggregate: "Packaging paper and paperboard" (post-1997)
    #                     "Wrapping and packaging paper and paperboard (1961-1997)"
    #                     These two cover non-overlapping periods.
    #   Tier 1 specific:  "Other paper and paperboard, not elsewhere specified"
    #                     "Newsprint" (short-lived, days-to-months in use)
    #   Tier 3 fallback:  Cartonboard, Case materials, Other mainly for packaging,
    #                     Wrapping papers → sub-items of "Packaging p&p" aggregate;
    #                     only used when the aggregate is absent.
    #   Tier 3:           "Other paper and paperboard" aggregate → when no specific
    #   Tier 4:           "Paper and paperboard" → lowest priority
    # ------------------------------------------------------------------

    # Newsprint → Other Paper (very short in-use life, like packaging)
    "Newsprint":  ("Other Paper", "t_np"),

    # Packaging aggregates (Tier 1 – primary, non-overlapping by period)
    "Packaging paper and paperboard":                          ("Other Paper", "t_pkg"),
    "Wrapping and packaging paper and paperboard (1961-1997)": ("Other Paper", "t_pkg"),

    # NES is a specific sub-item distinct from packaging aggregates
    "Other paper and paperboard, not elsewhere specified": ("Other Paper", "t_oth"),

    # Cartonboard / Case / Other mainly / Wrapping → fallback sub-items
    # These are sub-items of "Packaging paper and paperboard"; handled as
    # _PKG_SUB fallback in process_country.
    "Cartonboard":                       ("_PKG_SUB", "t_pkg"),
    "Case materials":                    ("_PKG_SUB", "t_pkg"),
    "Other papers mainly for packaging": ("_PKG_SUB", "t_pkg"),
    "Wrapping papers":                   ("_PKG_SUB", "t_pkg"),

    # ------------------------------------------------------------------
    # Biofuel
    # Wood residues / chips excluded (manufacturing by-products, double-count)
    # ------------------------------------------------------------------
    "Wood fuel":    ("Biofuel", "m3_soft"),
    "Wood pellets": ("Biofuel", "t_dry"),

    # ------------------------------------------------------------------
    # Biochar
    # ------------------------------------------------------------------
    "Wood charcoal": ("Biochar", "t_charcoal"),
}

# Aggregate fallback items handled in process_country (not in ITEM_MAP primary pass)
_PW_AGG_ITEM      = "Printing and writing papers"     # Tier-2 P&W aggregate
_GRAPHIC_AGG_ITEM = "Graphic papers"                  # Tier-3 full paper aggregate
_OTHPAP_AGG_ITEM  = "Other paper and paperboard"      # Tier-3 other-paper aggregate
_PAPER_AGG_ITEM   = "Paper and paperboard"            # Tier-4 lowest fallback


# ------------------------------------------------------------------------------
# Conversion Function
# ------------------------------------------------------------------------------

def to_kgC(value, unit_tag, p):
    """Convert one item-year consumption value to kg C."""
    cf = p["carbon_fraction_wood"]
    ds = p["density_softwood_kg_m3"]
    dh = p["density_hardwood_kg_m3"]
    dm = p["density_mixed_kg_m3"]

    if unit_tag == "m3_soft":
        return value * ds * cf
    elif unit_tag == "m3_hard":
        return value * dh * cf
    elif unit_tag == "m3_mixed":
        return value * dm * cf
    elif unit_tag == "m3_eng":
        return value * p["density_engineered_kg_m3"] * p["retention_engineered"] * cf
    elif unit_tag == "m3_ply":
        return value * dm * p["retention_plywood"] * cf
    elif unit_tag == "m3_pb":
        return value * p["density_particleboard_kg_m3"] * p["retention_particleboard"] * cf
    elif unit_tag == "m3_fb":
        return value * p["density_fibreboard_kg_m3"] * p["retention_fibreboard"] * cf
    elif unit_tag == "m3_panels":
        return value * p["density_panels_aggregate_kg_m3"] * p["retention_panels_aggregate"] * cf
    elif unit_tag in ("t_dry", "t_np", "t_graphic", "t_pw", "t_pkg", "t_hp", "t_oth", "t_paper"):
        return value * 1000 * cf
    elif unit_tag == "t_charcoal":
        return value * 1000 * p["carbon_fraction_charcoal"] * p["biochar_stable_fraction"]
    else:
        return 0.0

# ------------------------------------------------------------------------------
# Wide-format melting helper
# ------------------------------------------------------------------------------

def melt_country(df_country):
    """
    Melt a wide-format country slice (columns Y1961…Y2024) into long format:
        Item | Element | Year | Value
    Only rows with physical units (m3, t) are kept; '1000 USD' rows dropped.
    """
    id_cols   = ["Item", "Element", "Unit"]
    year_cols = [c for c in df_country.columns
                 if c.startswith("Y") and c[1:5].isdigit() and len(c) == 5]

    df_phys = df_country[df_country["Unit"].isin(["m3", "t"])].copy()
    if df_phys.empty:
        return pd.DataFrame(columns=["Item", "Element", "Year", "Value"])

    melted = df_phys[id_cols + year_cols].melt(
        id_vars    = id_cols,
        value_vars = year_cols,
        var_name   = "YearCol",
        value_name = "Value",
    )
    melted["Year"]  = melted["YearCol"].str[1:].astype(int)
    melted["Value"] = pd.to_numeric(melted["Value"], errors="coerce").fillna(0.0)
    return melted[["Item", "Element", "Year", "Value"]]


# ------------------------------------------------------------------------------
# Process one country
# ------------------------------------------------------------------------------

def process_country(long_df, country_name, output_dir, approach="consumption"):
    """
    Build the WPsCT input table for one country and save as CSV.

    Parameters
    ----------
    long_df      : pd.DataFrame   Melted long-format data for this country.
    country_name : str
    output_dir   : Path

    Returns
    -------
    pd.DataFrame or None
    """
    p     = get_params(country_name)
    years = sorted(long_df["Year"].unique())
    if not years:
        print(f"  warning  {country_name}: no physical-unit data -- skipped")
        return None

    # Compute net consumption per item per year
    pivot = long_df.pivot_table(
        index   = ["Item", "Year"],
        columns = "Element",
        values  = "Value",
        aggfunc = "sum",
    ).fillna(0.0)
    pivot.columns.name = None

    for col in ["Production", "Import quantity", "Export quantity"]:
        if col not in pivot.columns:
            pivot[col] = 0.0

    if approach == "production":
        # Production approach: carbon in products made from domestically-harvested
        # wood (exports retained, imports excluded) -> use Production only.
        pivot["Consumption"] = pivot["Production"].clip(lower=0.0)
    else:
        # Consumption / stock-change approach: apparent consumption physically
        # held in the country = Production + Imports - Exports.
        pivot["Consumption"] = (
            pivot["Production"]
            + pivot["Import quantity"]
            - pivot["Export quantity"]
        ).clip(lower=0.0)
    pivot = pivot.reset_index()

    # Build result table
    wpcst_cols = ["Biofuel", "Biochar", "Construction", "Exterior",
                  "Household", "Graphic Paper", "Household Paper", "Other Paper"]
    result = pd.DataFrame({"Year": years})
    for col in wpcst_cols:
        result[col] = 0.0

    # Track categories with data per year (to handle fallback items)
    covered = {col: set() for col in wpcst_cols}

    # -----------------------------------------------------------------------
    # Tracking sets for fallback hierarchy
    # -----------------------------------------------------------------------
    # Per-year coverage for specific (Tier-1) items within each aggregate group
    saw_specific   = set()   # years with Sawnwood, con or non-con
    panel_specific = set()   # years with any specific panel (plywood/osb/particle)
    fb_specific    = set()   # years with specific fibreboard sub-items
    pw_specific    = set()   # years with specific P&W sub-items (coated/mech/wf)
    oir_covered    = set()   # years with OIR aggregate data (to block specific fallback)

    # -----------------------------------------------------------------------
    # Main pass: Tier-1 specific items (always processed)
    # -----------------------------------------------------------------------
    TIER1_CATS = {"Construction", "Exterior", "Household",
                  "Graphic Paper", "Household Paper", "Other Paper",
                  "Biofuel", "Biochar",
                  "_SAW", "_PANEL", "_PANEL_FB", "_OIR",
                  "_PW_SPECIFIC"}
    tier1_items = {k for k, (cat, _) in ITEM_MAP.items() if cat in TIER1_CATS}

    for _, row in pivot[pivot["Item"].isin(tier1_items)].iterrows():
        item = row["Item"]
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0:
            continue

        category, unit_tag = ITEM_MAP[item]
        kgC     = to_kgC(v, unit_tag, p)
        yr_mask = result["Year"] == year

        # ---- Sawnwood specific → mark saw_specific ----
        if category == "_SAW":
            result.loc[yr_mask, "Construction"] += kgC * p["sawnwood_construction_frac"]
            result.loc[yr_mask, "Household"]    += kgC * p["sawnwood_household_frac"]
            covered["Construction"].add(year)
            covered["Household"].add(year)
            saw_specific.add(year)

        # ---- Specific fibreboard → mark fb_specific and panel_specific ----
        elif category == "_PANEL_FB":
            result.loc[yr_mask, "Construction"] += kgC * p["panels_construction_frac"]
            result.loc[yr_mask, "Household"]    += kgC * p["panels_household_frac"]
            covered["Construction"].add(year)
            covered["Household"].add(year)
            fb_specific.add(year)
            panel_specific.add(year)

        # ---- Specific non-fibreboard panels → mark panel_specific ----
        elif category == "_PANEL":
            result.loc[yr_mask, "Construction"] += kgC * p["panels_construction_frac"]
            result.loc[yr_mask, "Household"]    += kgC * p["panels_household_frac"]
            covered["Construction"].add(year)
            covered["Household"].add(year)
            panel_specific.add(year)

        # ---- OIR aggregate: split Exterior / Household, mark oir_covered ----
        elif category == "_OIR":
            result.loc[yr_mask, "Exterior"]  += kgC * p["other_indround_exterior_frac"]
            result.loc[yr_mask, "Household"] += kgC * p["other_indround_household_frac"]
            covered["Exterior"].add(year)
            covered["Household"].add(year)
            oir_covered.add(year)

        # ---- Specific P&W sub-items (coated/mech/wf) ----
        elif category == "_PW_SPECIFIC":
            result.loc[yr_mask, "Graphic Paper"] += kgC
            covered["Graphic Paper"].add(year)
            pw_specific.add(year)

        # ---- Regular category (Construction, Exterior, Biofuel, etc.) ----
        else:
            result.loc[yr_mask, category] += kgC
            covered[category].add(year)

    # -----------------------------------------------------------------------
    # Tier-2 fallbacks: sub-aggregates, skipped when specific items present
    # -----------------------------------------------------------------------

    # "Sawnwood" aggregate → only for years without specific sawnwood
    for _, row in pivot[pivot["Item"] == "Sawnwood"].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in saw_specific:
            continue
        kgC     = to_kgC(v, "m3_mixed", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Construction"] += kgC * p["sawnwood_construction_frac"]
        result.loc[yr_mask, "Household"]    += kgC * p["sawnwood_household_frac"]
        covered["Construction"].add(year)
        covered["Household"].add(year)
        saw_specific.add(year)

    # OIR specific production items → only for years without aggregate OIR data
    # These items track production-only (no trade adjustment), used as fallback
    # when "Other industrial roundwood" aggregate is absent for a country-year.
    _OIR_FALLBACK_ITEMS = {
        "Other industrial roundwood, coniferous (production)":     "m3_soft",
        "Other industrial roundwood, non-coniferous (production)": "m3_hard",
        "Other industrial roundwood, all species (export/import, 1961-1989)": "m3_mixed",
    }
    for oir_item, oir_unit in _OIR_FALLBACK_ITEMS.items():
        for _, row in pivot[pivot["Item"] == oir_item].iterrows():
            year = row["Year"]
            v    = row["Consumption"]
            if v <= 0 or year in oir_covered:
                continue
            kgC     = to_kgC(v, oir_unit, p)
            yr_mask = result["Year"] == year
            result.loc[yr_mask, "Exterior"]  += kgC * p["other_indround_exterior_frac"]
            result.loc[yr_mask, "Household"] += kgC * p["other_indround_household_frac"]
            covered["Exterior"].add(year)
            covered["Household"].add(year)
            oir_covered.add(year)   # prevent other fallback items from re-adding

    # "Fibreboard" aggregate → only for years without specific fibreboard
    for _, row in pivot[pivot["Item"] == "Fibreboard"].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in fb_specific:
            continue
        kgC     = to_kgC(v, "m3_fb", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Construction"] += kgC * p["panels_construction_frac"]
        result.loc[yr_mask, "Household"]    += kgC * p["panels_household_frac"]
        covered["Construction"].add(year)
        covered["Household"].add(year)
        panel_specific.add(year)   # flag panel coverage for panels aggregate

    # "Printing and writing papers" aggregate → only for years without specific P&W
    for _, row in pivot[pivot["Item"] == "Printing and writing papers"].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in pw_specific:
            continue
        kgC     = to_kgC(v, "t_pw", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Graphic Paper"] += kgC
        covered["Graphic Paper"].add(year)

    # -----------------------------------------------------------------------
    # Tier-3 fallbacks: full aggregates, skipped when any sub-item present
    # -----------------------------------------------------------------------

    # "Wood-based panels" aggregate → only for years without any specific panels
    for _, row in pivot[pivot["Item"] == "Wood-based panels"].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in panel_specific:
            continue
        kgC     = to_kgC(v, "m3_panels", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Construction"] += kgC * p["panels_construction_frac"]
        result.loc[yr_mask, "Household"]    += kgC * p["panels_household_frac"]
        covered["Construction"].add(year)
        covered["Household"].add(year)

    # "Graphic papers" aggregate → only for years without any P&W coverage
    for _, row in pivot[pivot["Item"] == _GRAPHIC_AGG_ITEM].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in covered["Graphic Paper"]:
            continue
        kgC     = to_kgC(v, "t_graphic", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Graphic Paper"] += kgC
        covered["Graphic Paper"].add(year)

    # "Other paper and paperboard" aggregate → only for years without specific Other Paper
    for _, row in pivot[pivot["Item"] == _OTHPAP_AGG_ITEM].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in covered["Other Paper"]:
            continue
        kgC     = to_kgC(v, "t_oth", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Other Paper"] += kgC
        covered["Other Paper"].add(year)

    # "Paper and paperboard" aggregate → lowest priority; split into sub-categories
    paper_covered = (covered["Graphic Paper"]
                     | covered["Household Paper"]
                     | covered["Other Paper"])

    for _, row in pivot[pivot["Item"] == _PAPER_AGG_ITEM].iterrows():
        year = row["Year"]
        v    = row["Consumption"]
        if v <= 0 or year in paper_covered:
            continue
        kgC     = to_kgC(v, "t_paper", p)
        yr_mask = result["Year"] == year
        result.loc[yr_mask, "Graphic Paper"]   += kgC * 0.40
        result.loc[yr_mask, "Household Paper"] += kgC * 0.10
        result.loc[yr_mask, "Other Paper"]     += kgC * 0.50

    # -----------------------------------------------------------------------
    # Round and save
    # -----------------------------------------------------------------------
    for col in wpcst_cols:
        result[col] = result[col].round(2)

    safe_name = (country_name
                 .replace("/", "-").replace("\\", "-")
                 .replace(":", "").replace("*", "")
                 .replace("?", "").replace('"', "")
                 .replace("<", "").replace(">", "")
                 .replace("|", ""))
    out_path = output_dir / f"{safe_name}.csv"
    result.to_csv(out_path, index=False)
    return result


# ------------------------------------------------------------------------------
# Regional consistency check
# ------------------------------------------------------------------------------
# FAO includes both country-level and regional aggregate rows in the same CSV.
# This function compares the sum of processed country CSVs against the
# corresponding regional aggregate CSVs and reports discrepancies.
#
# Region → member countries mapping (simplified UN M.49 / FAO regions)

FAO_REGION_MEMBERS = {
    "World": None,   # handled separately (sum of all countries)
    "Africa": {
        "Northern Africa", "Eastern Africa", "Middle Africa",
        "Southern Africa", "Western Africa",
    },
    "Americas": {
        "Northern America", "Central America", "Caribbean", "South America",
    },
    "Asia": {
        "Eastern Asia", "South-eastern Asia", "Southern Asia",
        "Central Asia", "Western Asia",
    },
    "Europe": {
        "Eastern Europe", "Northern Europe", "Southern Europe",
        "Western Europe",
    },
    "Oceania": {
        "Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia",
    },
}

# Sub-region → country lookup (countries that appear directly in these sub-regions)
# Note: FAO sub-regional aggregates often cover the same countries already
# captured by the top-level regional aggregates.
# For the check we compare top-level continental totals vs sum of all countries
# within each continent.

def run_regional_consistency_check(input_dir="WPsCT_Input",
                                   fao_csv=FAO_CSV,
                                   tolerance=0.10):
    """
    Compare sum of country-level WPsCT inputs against FAO regional aggregates.

    For each major FAO region (Africa, Americas, Asia, Europe, Oceania):
      1. Load the regional aggregate CSV from input_dir (e.g. Africa.csv).
      2. Identify which country CSVs belong to that region using the FAO source.
      3. Sum the country CSVs year-by-year.
      4. Compare each column.  Report years/columns where the relative
         discrepancy exceeds `tolerance`.

    Parameters
    ----------
    input_dir : str   Folder of processed per-country WPsCT CSVs.
    fao_csv   : str   Path to the raw FAOSTAT wide-format CSV.
    tolerance : float Relative discrepancy threshold (default 10 %).

    Returns
    -------
    dict  {region: pd.DataFrame of discrepancies}
    """
    print("\n" + "=" * 70)
    print("Regional Consistency Check")
    print("=" * 70)

    input_path = Path(input_dir)
    wpcst_cols = ["Biofuel", "Biochar", "Construction", "Exterior",
                  "Household", "Graphic Paper", "Household Paper", "Other Paper"]

    # Load raw FAO CSV to get region → country mapping
    df_fao = pd.read_csv(fao_csv, encoding="utf-8-sig", low_memory=False,
                         usecols=["Area"])
    all_areas = set(df_fao["Area"].unique())

    # Determine which areas are country-level vs. regional aggregates.
    # Heuristic: regional names typically appear without commas and match
    # FAO standard region names.  We rely on which CSVs actually exist.
    all_csvs = {f.stem for f in input_path.glob("*.csv")}

    # Major FAO continental regions to check
    top_regions = ["Africa", "Americas", "Asia", "Europe", "Oceania"]

    # Build continent membership from raw FAO data via the "Area" hierarchy.
    # We use a fallback approach: identify which country-level CSVs have their
    # names also present in the FAO raw file, and group by continent assignment.
    # Since full hierarchy metadata is not in the bulk CSV, we use known lists.
    CONTINENT_MEMBERS = {
        "Africa": {
            "Algeria","Angola","Benin","Botswana","Burkina Faso","Burundi","Cabo Verde",
            "Cameroon","Central African Republic","Chad","Comoros","Congo",
            "Côte d'Ivoire","Democratic Republic of the Congo","Djibouti","Egypt",
            "Equatorial Guinea","Eritrea","Eswatini","Ethiopia","Ethiopia PDR","Gabon",
            "Gambia","Ghana","Guinea","Guinea-Bissau","Kenya","Lesotho","Liberia",
            "Libya","Madagascar","Malawi","Mali","Mauritania","Mauritius","Mayotte",
            "Morocco","Mozambique","Namibia","Niger","Nigeria","Réunion","Rwanda",
            "Sao Tome and Principe","Senegal","Seychelles","Sierra Leone","Somalia",
            "South Africa","South Sudan","Sudan","Sudan (former)","Tanzania",
            "Togo","Tunisia","Uganda","United Republic of Tanzania","Western Sahara",
            "Zambia","Zimbabwe",
        },
        "Americas": {
            "Anguilla","Antigua and Barbuda","Argentina","Aruba","Bahamas","Barbados",
            "Belize","Bolivia (Plurinational State of)","Brazil","British Virgin Islands",
            "Canada","Cayman Islands","Chile","Colombia","Costa Rica","Cuba","Curaçao",
            "Dominica","Dominican Republic","Ecuador","El Salvador","Falkland Islands (Malvinas)",
            "French Guiana","Grenada","Guadeloupe","Guatemala","Guyana","Haiti","Honduras",
            "Jamaica","Martinique","Mexico","Montserrat","Nicaragua","Panama","Paraguay",
            "Peru","Puerto Rico","Saint Kitts and Nevis","Saint Lucia",
            "Saint Vincent and the Grenadines","Sint Maarten (Dutch part)",
            "Saint Martin (French part)","Saint Pierre and Miquelon",
            "Suriname","Trinidad and Tobago","Turks and Caicos Islands",
            "United States of America","Uruguay","Venezuela (Bolivarian Republic of)",
            "Virgin Islands, US",
        },
        "Asia": {
            "Afghanistan","Armenia","Azerbaijan","Bahrain","Bangladesh","Bhutan",
            "Brunei Darussalam","Cambodia","China","China, mainland","China, Hong Kong SAR",
            "China, Macao SAR","China, Taiwan Province of","Cyprus","Georgia",
            "India","Indonesia","Iran (Islamic Republic of)","Iraq","Israel","Japan",
            "Jordan","Kazakhstan","Kuwait","Kyrgyzstan","Lao People's Democratic Republic",
            "Lebanon","Malaysia","Maldives","Mongolia","Myanmar","Nepal","Oman",
            "Pakistan","Palestine","Philippines","Qatar","Republic of Korea",
            "Saudi Arabia","Singapore","Sri Lanka","Syrian Arab Republic","Tajikistan",
            "Thailand","Timor-Leste","Türkiye","Turkmenistan","United Arab Emirates",
            "Uzbekistan","Viet Nam","Yemen",
            "Democratic People's Republic of Korea",
        },
        "Europe": {
            "Albania","Andorra","Austria","Belarus","Belgium","Belgium-Luxembourg",
            "Bosnia and Herzegovina","Bulgaria","Croatia","Czechia","Czechoslovakia",
            "Denmark","Estonia","Faroe Islands","Finland","France","Germany","Gibraltar",
            "Greece","Greenland","Hungary","Iceland","Ireland","Italy","Latvia",
            "Liechtenstein","Lithuania","Luxembourg","Malta","Monaco","Montenegro",
            "Netherlands (Kingdom of the)","North Macedonia","Norway","Poland","Portugal",
            "Republic of Moldova","Romania","Russian Federation","San Marino","Serbia",
            "Serbia and Montenegro","Slovakia","Slovenia","Spain","Sweden","Switzerland",
            "Ukraine","United Kingdom of Great Britain and Northern Ireland","USSR",
            "Yugoslav SFR",
        },
        "Oceania": {
            "American Samoa","Australia","Christmas Island","Cocos (Keeling) Islands",
            "Cook Islands","Fiji","French Polynesia","Guam","Kiribati","Marshall Islands",
            "Micronesia (Federated States of)","Nauru","New Caledonia","New Zealand",
            "Niue","Norfolk Island","Northern Mariana Islands","Palau","Papua New Guinea",
            "Pitcairn","Polynesia","Samoa","Solomon Islands","Tokelau","Tonga","Tuvalu",
            "Vanuatu","Wallis and Futuna Islands",
        },
    }

    discrepancy_report = {}

    for region in top_regions:
        region_csv = input_path / f"{region}.csv"
        if not region_csv.exists():
            print(f"  [skip] {region}: no regional CSV found in {input_dir}")
            continue

        # Load regional aggregate
        df_region = pd.read_csv(region_csv)
        if "Year" not in df_region.columns:
            continue

        # Sum country CSVs for this region
        members = CONTINENT_MEMBERS.get(region, set())
        country_sum = None
        missing = []
        for cname in members:
            safe = (cname.replace("/","-").replace("\\","-").replace(":","")
                    .replace("*","").replace("?","").replace('"',"")
                    .replace("<","").replace(">","").replace("|",""))
            cpath = input_path / f"{safe}.csv"
            if not cpath.exists():
                missing.append(cname)
                continue
            df_c = pd.read_csv(cpath)
            if country_sum is None:
                country_sum = df_c.copy()
            else:
                country_sum = country_sum.merge(df_c, on="Year",
                                                how="outer",
                                                suffixes=("", "_r"))
                for col in wpcst_cols:
                    if col+"_r" in country_sum.columns:
                        country_sum[col] = country_sum[col].fillna(0) + country_sum[col+"_r"].fillna(0)
                        country_sum.drop(columns=[col+"_r"], inplace=True)
                country_sum.fillna(0, inplace=True)

        if country_sum is None:
            print(f"  [skip] {region}: no member country CSVs found")
            continue

        # Merge with regional totals and compare
        merged = country_sum.merge(df_region, on="Year", how="inner",
                                   suffixes=("_sum", "_fao"))

        discrepancies = []
        for col in wpcst_cols:
            scol = col + "_sum"
            fcol = col + "_fao"
            if scol not in merged.columns or fcol not in merged.columns:
                continue
            diff = (merged[scol] - merged[fcol]).abs()
            denom = merged[fcol].abs().replace(0, float("nan"))
            rel_err = (diff / denom).fillna(0)
            bad = merged[rel_err > tolerance]
            if not bad.empty:
                avg_err = rel_err[rel_err > tolerance].mean()
                discrepancies.append((col, len(bad), float(avg_err)))

        if discrepancies:
            print(f"\n  {region}: discrepancies found (>{tolerance*100:.0f}% tolerance)")
            for col, n, avg in discrepancies:
                print(f"    {col:<18s}  {n:3d} years exceed tolerance  "
                      f"(avg relative error {avg*100:.1f}%)")
        else:
            print(f"  {region}: OK  (all columns within {tolerance*100:.0f}% tolerance)")

        if missing:
            print(f"    Missing member CSVs ({len(missing)}): "
                  + ", ".join(missing[:5])
                  + (" …" if len(missing) > 5 else ""))

        discrepancy_report[region] = discrepancies

    print("=" * 70 + "\n")
    return discrepancy_report


# ------------------------------------------------------------------------------
# Main -- process all countries
# ------------------------------------------------------------------------------
def main(approaches=("consumption", "production")):
    """Build WPsCT inputs under one or more IPCC accounting boundaries.

    consumption -> OUTPUT_DIR (= "WPsCT_Input")            : Production + Imports - Exports
    production  -> OUTPUT_DIR + "_production"              : Production only
    Re-running this script regenerates BOTH datasets.
    """
    print(f"Loading {FAO_CSV} ...")
    df = pd.read_csv(FAO_CSV, encoding="utf-8-sig", low_memory=False)
    countries = COUNTRIES if COUNTRIES is not None else sorted(df["Area"].unique())

    for approach in approaches:
        out_dir = Path(OUTPUT_DIR if approach == "consumption" else OUTPUT_DIR + "_production")
        out_dir.mkdir(parents=True, exist_ok=True)
        print(f"\n=== Approach: {approach}  ->  {out_dir}/   ({len(countries)} countries) ===")
        ok, skipped = 0, 0
        for country in countries:
            df_c  = df[df["Area"] == country].copy()
            long  = melt_country(df_c)
            res   = process_country(long, country, out_dir, approach=approach)
            if res is not None:
                ok += 1
            else:
                skipped += 1
        print(f"Done ({approach}).  {ok} files saved in '{out_dir}/',  {skipped} skipped.")

    # Regional consistency check applies to the consumption set (mirrors FAO apparent consumption)
    if "consumption" in approaches:
        run_regional_consistency_check(
            input_dir = OUTPUT_DIR,
            fao_csv   = FAO_CSV,
            tolerance = 0.10,
        )


#==============================================================================
# Country tracker and batch runner  (per-country inputs -> combined carbon dataset)
#==============================================================================
def tracker(wp_data, wp_para, savefile=None, param_set="developed"):
    """
    Run the Wood Products Carbon Tracker for one country.

    Parameters
    ----------
    wp_data   : str   Path to per-country WPsCT input CSV.
    wp_para   : str   Path to WPs_Tracker_paras.csv (multi-set format).
    savefile  : str   Path for output CSV.
    param_set : str   One of 'developed', 'emerging', 'tropical_developing'.
    """
    # Read data
    data = pd.read_csv(wp_data)
    tyr  = len(data['Year'])

    # Read parameters and filter to the requested parameter set
    para_all = pd.read_csv(wp_para)
    if 'ParameterSet' in para_all.columns:
        para = para_all[para_all['ParameterSet'] == param_set].copy()
        if para.empty:
            raise ValueError(
                f"Parameter set '{param_set}' not found in {wp_para}. "
                f"Available sets: {para_all['ParameterSet'].unique().tolist()}"
            )
    else:
        # Legacy single-set file: use as-is
        para = para_all.copy()

    def _get(product, variable):
        """Convenience lookup into filtered para table."""
        rows = para.loc[
            (para['Product'] == product) & (para['Variable'] == variable),
            'Parameter'
        ]
        if rows.empty:
            raise KeyError(f"Parameter [{product}, {variable}] not found "
                           f"for set '{param_set}'")
        return rows.values[0]

    # ---------------- Biofuel / Biochar / Charcoal  carbon flux --------------
    bf_eff = float(_get('Biofuel', 'efficiency'))
    if bf_eff > 1:
        bf_eff = bf_eff / 100.0

    bc_dc1 = float(_get('Biochar', 'decay_1'))
    bc_dc2 = float(_get('Biochar', 'decay_2'))

    ch_inflow, fuel_emis = biofuel_CF(tyr, data['Biofuel'], bf_eff)

    biochar_prod = (pd.Series(data['Biochar'], dtype=float).reset_index(drop=True)
                    + pd.Series(ch_inflow, dtype=float))
    bc_stock, bc_decay = biochar_CF(tyr, biochar_prod, bc_dc1, bc_dc2)

    # ---------------- Wood products disposal and recycling -------------------
    # Construction
    codp1 = float(_get('Construction', 'disposal_1'))
    codp2 = float(_get('Construction', 'disposal_2'))
    codp3 = float(_get('Construction', 'disposal_3'))
    corp1 = float(_get('Construction', 'recycle_1'))
    corp2 = float(_get('Construction', 'recycle_2'))
    co_inuse, co_dispos = disposal_CF(tyr, data['Construction'], codp1, codp2, codp3)
    co_recyc, co_lfin   = recycle_CF(tyr, pd.Series(co_dispos, dtype=float), corp1, corp2)

    # Exterior (no recycling)
    exdp1 = float(_get('Exterior', 'disposal_1'))
    exdp2 = float(_get('Exterior', 'disposal_2'))
    exdp3 = float(_get('Exterior', 'disposal_3'))
    ex_inuse, ex_dispos = disposal_CF(tyr, data['Exterior'], exdp1, exdp2, exdp3)
    ex_lfin = pd.Series(ex_dispos, dtype=float)   # no recycling

    # Household
    hodp1 = float(_get('Household', 'disposal_1'))
    hodp2 = float(_get('Household', 'disposal_2'))
    hodp3 = float(_get('Household', 'disposal_3'))
    horp1 = float(_get('Household', 'recycle_1'))
    horp2 = float(_get('Household', 'recycle_2'))
    ho_inuse, ho_dispos = disposal_CF(tyr, data['Household'], hodp1, hodp2, hodp3)
    ho_recyc, ho_lfin   = recycle_CF(tyr, pd.Series(ho_dispos, dtype=float), horp1, horp2)

    # Graphic Paper
    gpd1 = float(_get('Graphic Paper', 'disposal_1'))
    gpd2 = float(_get('Graphic Paper', 'disposal_2'))
    gpd3 = float(_get('Graphic Paper', 'disposal_3'))
    gpr1 = float(_get('Graphic Paper', 'recycle_1'))
    gpr2 = float(_get('Graphic Paper', 'recycle_2'))
    gp_inuse, gp_dispos = disposal_CF(tyr, data['Graphic Paper'], gpd1, gpd2, gpd3)
    gp_recyc, gp_lfin   = recycle_CF(tyr, pd.Series(gp_dispos, dtype=float), gpr1, gpr2)

    # Other Paper
    opd1 = float(_get('Other Paper', 'disposal_1'))
    opd2 = float(_get('Other Paper', 'disposal_2'))
    opd3 = float(_get('Other Paper', 'disposal_3'))
    opr1 = float(_get('Other Paper', 'recycle_1'))
    opr2 = float(_get('Other Paper', 'recycle_2'))
    op_inuse, op_dispos = disposal_CF(tyr, data['Other Paper'], opd1, opd2, opd3)
    op_recyc, op_lfin   = recycle_CF(tyr, pd.Series(op_dispos, dtype=float), opr1, opr2)

    # Household Paper (no recycling)
    hpd1 = float(_get('Household Paper', 'disposal_1'))
    hpd2 = float(_get('Household Paper', 'disposal_2'))
    hpd3 = float(_get('Household Paper', 'disposal_3'))
    hp_inuse, hp_dispos = disposal_CF(tyr, data['Household Paper'], hpd1, hpd2, hpd3)
    hp_lfin = pd.Series(hp_dispos, dtype=float)

    # ---------------- Landfill carbon flux -----------------------------------
    codc1 = float(_get('Landfill', 'con_decay1'))
    codc2 = float(_get('Landfill', 'con_decay2'))
    exdc1 = float(_get('Landfill', 'ext_decay1'))
    exdc2 = float(_get('Landfill', 'ext_decay2'))
    hodc1 = float(_get('Landfill', 'hou_decay1'))
    hodc2 = float(_get('Landfill', 'hou_decay2'))
    padc1 = float(_get('Landfill', 'pap_decay1'))
    padc2 = float(_get('Landfill', 'pap_decay2'))

    lf_pap = (pd.Series(gp_lfin, dtype=float)
              + pd.Series(op_lfin, dtype=float)
              + pd.Series(hp_lfin, dtype=float))

    con_pool, con_dec = landfill_CF(tyr, pd.Series(co_lfin, dtype=float), codc1, codc2)
    ext_pool, ext_dec = landfill_CF(tyr, pd.Series(ex_lfin, dtype=float), exdc1, exdc2)
    hou_pool, hou_dec = landfill_CF(tyr, pd.Series(ho_lfin, dtype=float), hodc1, hodc2)
    pap_pool, pap_dec = landfill_CF(tyr, lf_pap, padc1, padc2)

    S_lf = (pd.Series(co_lfin, dtype=float) + pd.Series(ex_lfin, dtype=float)
            + pd.Series(ho_lfin, dtype=float) + lf_pap)
    P_lf = (pd.Series(con_pool, dtype=float) + pd.Series(ext_pool, dtype=float)
            + pd.Series(hou_pool, dtype=float) + pd.Series(pap_pool, dtype=float))
    D_lf = (pd.Series(con_dec, dtype=float) + pd.Series(ext_dec, dtype=float)
            + pd.Series(hou_dec, dtype=float) + pd.Series(pap_dec, dtype=float))

    # ---------------- Save results -------------------------------------------
    out = pd.DataFrame({
        'Year': data['Year'],

        'Fuel_Emissions': pd.Series(fuel_emis, dtype=float),
        'Biochar_Stock' : pd.Series(bc_stock,  dtype=float),
        'Biochar_Decay' : pd.Series(bc_decay,  dtype=float),

        'Construction_InUse'     : pd.Series(co_inuse,  dtype=float),
        'Construction_Disposed'  : pd.Series(co_dispos, dtype=float),
        'Construction_Recycled'  : pd.Series(co_recyc,  dtype=float),
        'Construction_LandfillIn': pd.Series(co_lfin,   dtype=float),

        'Exterior_InUse'      : pd.Series(ex_inuse,  dtype=float),
        'Exterior_Disposed'   : pd.Series(ex_dispos, dtype=float),
        'Exterior_LandfillIn' : pd.Series(ex_lfin,   dtype=float),

        'Household_InUse'     : pd.Series(ho_inuse,  dtype=float),
        'Household_Disposed'  : pd.Series(ho_dispos, dtype=float),
        'Household_Recycled'  : pd.Series(ho_recyc,  dtype=float),
        'Household_LandfillIn': pd.Series(ho_lfin,   dtype=float),

        'GraphicPaper_InUse'     : pd.Series(gp_inuse,  dtype=float),
        'GraphicPaper_Disposed'  : pd.Series(gp_dispos, dtype=float),
        'GraphicPaper_Recycled'  : pd.Series(gp_recyc,  dtype=float),
        'GraphicPaper_LandfillIn': pd.Series(gp_lfin,   dtype=float),

        'OtherPaper_InUse'     : pd.Series(op_inuse,  dtype=float),
        'OtherPaper_Disposed'  : pd.Series(op_dispos, dtype=float),
        'OtherPaper_Recycled'  : pd.Series(op_recyc,  dtype=float),
        'OtherPaper_LandfillIn': pd.Series(op_lfin,   dtype=float),

        'HouseholdPaper_InUse'     : pd.Series(hp_inuse,  dtype=float),
        'HouseholdPaper_Disposed'  : pd.Series(hp_dispos, dtype=float),
        'HouseholdPaper_LandfillIn': pd.Series(hp_lfin,   dtype=float),

        'LF_Input_Total': pd.Series(S_lf, dtype=float),
        'LF_Stock_Total': pd.Series(P_lf, dtype=float),
        'LF_Decay_Total': pd.Series(D_lf, dtype=float),
    })

    if savefile is not None:
        out.to_csv(f'{savefile}', index=False)
        print(f"  saved [{param_set}] -> {savefile}")
    return out


#------------------------------------------------------------------------------
# Batch runner: process all countries in WPsCT_Input -> one combined World_Data_consumption.csv
def run_all_countries(input_dir        = 'WPsCT_Input',
                      para_file        = 'WPs_Tracker_paras.csv',
                      output_file      = 'World_Data/World_Data_consumption.csv',
                      keep_per_country = False):
    """
    Run tracker() for every CSV file in input_dir and save ALL results into a
    single combined CSV (output_file) with a leading 'Country' column.

    Country names are taken from the input filename stem, so they match the
    names used by the web app's country/region selector exactly.

    The parameter set is selected automatically by country name
    (developed | emerging | tropical_developing) via get_country_group().

    Parameters
    ----------
    input_dir        : str   Folder containing per-country input CSVs.
    para_file        : str   Path to WPs_Tracker_paras.csv (multi-set format).
    output_file      : str   Path of the single combined output CSV.
    keep_per_country : bool  If True, also write one CSV per country into a
                             legacy 'WPsCT_Output/' folder.
    """
    input_path  = Path(input_dir)
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    country_files = sorted(input_path.glob('*.csv'))
    if not country_files:
        print(f"No CSV files found in '{input_dir}'. Nothing to process.")
        return

    legacy_dir = Path('WPsCT_Output')
    if keep_per_country:
        legacy_dir.mkdir(parents=True, exist_ok=True)

    total    = len(country_files)
    ok       = 0
    skipped  = []
    combined = []                               # list of per-country DataFrames

    print(f"Starting batch run: {total} countries")
    print(f"  Input dir   : {input_path.resolve()}")
    print(f"  Parameters  : {para_file}")
    print(f"  Output file : {output_path.resolve()}")
    print("-" * 60)

    for csv_file in country_files:
        country_name = csv_file.stem            # exact name used by the web app
        param_set    = get_country_group(country_name)
        try:
            result = tracker(str(csv_file), para_file, param_set=param_set)
            result.insert(0, 'Country', country_name)
            combined.append(result)
            if keep_per_country:
                result.drop(columns='Country').to_csv(
                    legacy_dir / csv_file.name, index=False)
            ok += 1
        except Exception as e:
            print(f"  [error] {country_name}: {e}")
            skipped.append(country_name)

    if combined:
        pd.concat(combined, ignore_index=True).to_csv(output_path, index=False)

    print("-" * 60)
    print(f"Done.  {ok}/{total} countries -> '{output_file}'")
    if skipped:
        print(f"Skipped ({len(skipped)}): {', '.join(skipped)}")
