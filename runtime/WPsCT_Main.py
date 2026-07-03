#------------------------------------------------------------------------------
# Wood Products Carbon Tracker – maine
# Created on Fri Sep 12 09:43:12 2025                
# author: xinyuan.wei
#------------------------------------------------------------------------------
import pandas as pd
import WPsCT_Functions as wf

#------------------------------------------------------------------------------
# Function to track wood products carbon flux
def tracker (wp_data, wp_para, savefile):
    # Read data and parameters
    data = pd.read_csv(wp_data)
    para = pd.read_csv(wp_para)
    tyr  = len(data['Year'])

    # ---------------- Biofuel / Biochar / Charcoal  carbon flux --------------
    # Biofuel burning efficiency
    bf_eff = para.loc[(para['Product']=='Biofuel') & (para['Variable']=='efficiency'),'Parameter'].values[0]
    if bf_eff > 1:  # accept 0..100 or 0..1
        bf_eff = bf_eff / 100.0

    # Biochar decay parameters
    bc_dc1 = para.loc[(para['Product']=='Biochar') & (para['Variable']=='decay_1'),'Parameter'].values[0]
    bc_dc2 = para.loc[(para['Product']=='Biochar') & (para['Variable']=='decay_2'),'Parameter'].values[0]

    # Biofuel -> (charcoal inflow, emissions)
    ch_inflow, fuel_emis = wf.biofuel_CF(tyr, data['Biofuel'], bf_eff)

    # Biochar stock and decay (explicit production + charcoal from biofuel)
    biochar_prod = pd.Series(data['Biochar'], dtype=float).reset_index(drop=True) + pd.Series(ch_inflow, dtype=float)
    bc_stock, bc_decay = wf.biochar_CF(tyr, biochar_prod, bc_dc1, bc_dc2)

    # ---------------- Wood products disposal and recycling -------------------
    # Construction wood products
    codp1 = para.loc[(para['Product']=='Construction') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    codp2 = para.loc[(para['Product']=='Construction') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    codp3 = para.loc[(para['Product']=='Construction') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    corp1 = para.loc[(para['Product']=='Construction') & (para['Variable']=='recycle_1'),'Parameter'].values[0]
    corp2 = para.loc[(para['Product']=='Construction') & (para['Variable']=='recycle_2'),'Parameter'].values[0]
    co_inuse, co_dispos = wf.disposal_CF(tyr, data['Construction'], codp1, codp2, codp3)
    co_recyc, co_lfin  = wf.recycle_CF(tyr, pd.Series(co_dispos, dtype=float), corp1, corp2)

    # Exterior (no recycling)
    exdp1 = para.loc[(para['Product']=='Exterior') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    exdp2 = para.loc[(para['Product']=='Exterior') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    exdp3 = para.loc[(para['Product']=='Exterior') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    ex_inuse, ex_dispos = wf.disposal_CF(tyr, data['Exterior'], exdp1, exdp2, exdp3)
    ex_lfin = pd.Series(ex_dispos, dtype=float)  # no recycling

    # Household
    hodp1 = para.loc[(para['Product']=='Household') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    hodp2 = para.loc[(para['Product']=='Household') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    hodp3 = para.loc[(para['Product']=='Household') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    horp1 = para.loc[(para['Product']=='Household') & (para['Variable']=='recycle_1'),'Parameter'].values[0]
    horp2 = para.loc[(para['Product']=='Household') & (para['Variable']=='recycle_2'),'Parameter'].values[0]
    ho_inuse, ho_dispos = wf.disposal_CF(tyr, data['Household'], hodp1, hodp2, hodp3)
    ho_recyc, ho_lfin   = wf.recycle_CF(tyr, pd.Series(ho_dispos, dtype=float), horp1, horp2)

    # Graphic Paper
    gpd1 = para.loc[(para['Product']=='Graphic Paper') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    gpd2 = para.loc[(para['Product']=='Graphic Paper') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    gpd3 = para.loc[(para['Product']=='Graphic Paper') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    gpr1 = para.loc[(para['Product']=='Graphic Paper') & (para['Variable']=='recycle_1'),'Parameter'].values[0]
    gpr2 = para.loc[(para['Product']=='Graphic Paper') & (para['Variable']=='recycle_2'),'Parameter'].values[0]
    gp_inuse, gp_dispos = wf.disposal_CF(tyr, data['Graphic Paper'], gpd1, gpd2, gpd3)
    gp_recyc, gp_lfin   = wf.recycle_CF(tyr, pd.Series(gp_dispos, dtype=float), gpr1, gpr2)

    # Other Paper
    opd1 = para.loc[(para['Product']=='Other Paper') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    opd2 = para.loc[(para['Product']=='Other Paper') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    opd3 = para.loc[(para['Product']=='Other Paper') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    opr1 = para.loc[(para['Product']=='Other Paper') & (para['Variable']=='recycle_1'),'Parameter'].values[0]
    opr2 = para.loc[(para['Product']=='Other Paper') & (para['Variable']=='recycle_2'),'Parameter'].values[0]
    op_inuse, op_dispos = wf.disposal_CF(tyr, data['Other Paper'], opd1, opd2, opd3)
    op_recyc, op_lfin   = wf.recycle_CF(tyr, pd.Series(op_dispos, dtype=float), opr1, opr2)

    # Household Paper (no recycling)
    hpd1 = para.loc[(para['Product']=='Household Paper') & (para['Variable']=='disposal_1'),'Parameter'].values[0]
    hpd2 = para.loc[(para['Product']=='Household Paper') & (para['Variable']=='disposal_2'),'Parameter'].values[0]
    hpd3 = para.loc[(para['Product']=='Household Paper') & (para['Variable']=='disposal_3'),'Parameter'].values[0]
    hp_inuse, hp_dispos = wf.disposal_CF(tyr, data['Household Paper'], hpd1, hpd2, hpd3)
    hp_lfin = pd.Series(hp_dispos, dtype=float)

    # ---------------- Landfill carbon flux -----------------------------------
    # Landfill decay parameters
    codc1 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='con_decay1'),'Parameter'].values[0]
    codc2 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='con_decay2'),'Parameter'].values[0]
    exdc1 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='ext_decay1'),'Parameter'].values[0]
    exdc2 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='ext_decay2'),'Parameter'].values[0]
    hodc1 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='hou_decay1'),'Parameter'].values[0]
    hodc2 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='hou_decay2'),'Parameter'].values[0]
    padc1 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='pap_decay1'),'Parameter'].values[0]
    padc2 = para.loc[(para['Product']=='Landfill') & (para['Variable']=='pap_decay2'),'Parameter'].values[0]

    # Paper-landfill input = Graphic + Other
    lf_pap = pd.Series(gp_lfin, dtype=float) + pd.Series(op_lfin, dtype=float) + pd.Series(hp_lfin, dtype=float)

    # Landfill per stream
    con_pool, con_dec = wf.landfill_CF(tyr, pd.Series(co_lfin, dtype=float), codc1, codc2)
    ext_pool, ext_dec = wf.landfill_CF(tyr, pd.Series(ex_lfin, dtype=float), exdc1, exdc2)
    hou_pool, hou_dec = wf.landfill_CF(tyr, pd.Series(ho_lfin, dtype=float), hodc1, hodc2)
    pap_pool, pap_dec = wf.landfill_CF(tyr, lf_pap, padc1, padc2)

    # Totals for saving
    S_lf = pd.Series(co_lfin, dtype=float) + pd.Series(ex_lfin, dtype=float) + pd.Series(ho_lfin + lf_pap, dtype=float)
    P_lf = pd.Series(con_pool, dtype=float) + pd.Series(ext_pool, dtype=float) + pd.Series(hou_pool, dtype=float) + pd.Series(pap_pool, dtype=float)
    D_lf = pd.Series(con_dec, dtype=float) + pd.Series(ext_dec, dtype=float) + pd.Series(hou_dec, dtype=float) + pd.Series(pap_dec, dtype=float)


    # ---------------- Save results ----------------
    out = pd.DataFrame({
        'Year': data['Year'],

        'Fuel_Emissions': pd.Series(fuel_emis, dtype=float),
        'Biochar_Stock' : pd.Series(bc_stock, dtype=float),
        'Biochar_Decay' : pd.Series(bc_decay, dtype=float),

        'Construction_InUse'   : pd.Series(co_inuse, dtype=float),
        'Construction_Disposed': pd.Series(co_dispos, dtype=float),
        'Construction_Recycled': pd.Series(co_recyc, dtype=float),
        'Construction_LandfillIn': pd.Series(co_lfin, dtype=float),

        'Exterior_InUse'   : pd.Series(ex_inuse, dtype=float),
        'Exterior_Disposed': pd.Series(ex_dispos, dtype=float),
        'Exterior_LandfillIn': pd.Series(ex_lfin, dtype=float),

        'Household_InUse'   : pd.Series(ho_inuse, dtype=float),
        'Household_Disposed': pd.Series(ho_dispos, dtype=float),
        'Household_Recycled': pd.Series(ho_recyc, dtype=float),
        'Household_LandfillIn': pd.Series(ho_lfin, dtype=float),

        'GraphicPaper_InUse'   : pd.Series(gp_inuse, dtype=float),
        'GraphicPaper_Disposed': pd.Series(gp_dispos, dtype=float),
        'GraphicPaper_Recycled': pd.Series(gp_recyc, dtype=float),
        'GraphicPaper_LandfillIn': pd.Series(gp_lfin, dtype=float),

        'OtherPaper_InUse'   : pd.Series(op_inuse, dtype=float),
        'OtherPaper_Disposed': pd.Series(op_dispos, dtype=float),
        'OtherPaper_Recycled': pd.Series(op_recyc, dtype=float),
        'OtherPaper_LandfillIn': pd.Series(op_lfin, dtype=float),

        'HouseholdPaper_InUse'   : pd.Series(hp_inuse, dtype=float),
        'HouseholdPaper_Disposed': pd.Series(hp_dispos, dtype=float),
        'HouseholdPaper_LandfillIn': pd.Series(hp_lfin, dtype=float),

        'LF_Input_Total' : pd.Series(S_lf, dtype=float),
        'LF_Stock_Total' : pd.Series(P_lf, dtype=float),
        'LF_Decay_Total' : pd.Series(D_lf, dtype=float)
    })

    out.to_csv(f'{savefile}', index=False)
    print(f"Saved results -> {savefile}")
