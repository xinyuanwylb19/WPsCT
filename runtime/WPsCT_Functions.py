#------------------------------------------------------------------------------
# Wood Products Carbon Tracker – Functions
# Created on Fri Sep 12 09:43:12 2025                
# author: xinyuan.wei
#------------------------------------------------------------------------------
import math
import pandas as pd
try:
    import scipy.integrate as integrate
except Exception:
    class _IntegrateFallback:
        @staticmethod
        def quad(func, a, b, **kwargs):
            if b <= a:
                return (0.0, 0.0)
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
    arr = [float(production.iat[j]) if j < len(production) else 0.0 for j in range(years)]

    # Precompute the in-use survival fraction and disposal rate by age ONCE, then
    # convolve.  (Integrating inside the double loop is ~20x slower in the browser.)
    IU = [0.0] * (years + 1)
    DR = [0.0] * (years + 1)
    for a in range(years + 1):
        val = 1.0 - integrate.quad(
            lambda tt: disposal_rate(tt, dp1, dp2, dp3),
            0.0, float(a)
        )[0]
        IU[a] = min(1.0, max(0.0, float(val)))
        DR[a] = disposal_rate(float(a), dp1, dp2, dp3)

    inuse = pd.Series(index=range(years), dtype=float)
    dispos = pd.Series(index=range(years), dtype=float)
    for i in range(years):
        s = 0.0
        d = 0.0
        for j in range(i + 1):
            c = arr[j]
            age = i - j + 1
            s += c * IU[age]
            d += c * DR[age]
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

#------------------------------------------------------------------------------
# Plot annual production lines for wood products
