#------------------------------------------------------------------------------
# Wood Products Carbon Tracker - Data Generator
# One command: raw FAOSTAT  ->  global wood products carbon datasets
# author: xinyuan.wei
#------------------------------------------------------------------------------
"""
Regenerate the global datasets used by the WPsC Tracker web app from a fresh
FAOSTAT download, in a single run.

Pipeline
--------
  1. Convert the raw FAOSTAT forestry file into per-country input files for both
     accounting approaches (consumption and production).
  2. Run the tracker on every country for each approach.
  3. Write the two combined datasets straight into  ../World_Data/  (the folder
     the web app reads):
         World_Data_consumption.csv
         World_Data_production.csv

Before running
--------------
  * Place the updated FAOSTAT "Forestry: Production and Trade" bulk file at:
        Forestry_E_All_Data/Forestry_E_All_Data.csv
  * All parameters are read from  WPs_Tracker_paras.csv  (single source of truth):
        Product = "Conversion"  -> carbon fractions, densities, retentions
        Product = "Allocation"  -> end-use allocation fractions (per country group)
        everything else         -> tracker disposal / recycling / landfill parameters

Usage
-----
    python WPsCT_Data_Generator.py
"""

import os
from pathlib import Path

import WPsCT_Functions as wf                 # all pipeline functions (converter + tracker)

#------------------------------------------------------------------------------
# Paths (everything is relative to this script's folder, i.e. data/FAO Data/)
#------------------------------------------------------------------------------
HERE           = Path(__file__).resolve().parent
PARA_FILE      = 'WPs_Tracker_paras.csv'
WORLD_DATA_DIR = HERE.parent / 'World_Data'          # data/World_Data/  (read by the web app)

# approach     : (per-country input folder,   combined output file name)
APPROACHES = {
    'consumption': ('WPsCT_Input',           'World_Data_consumption.csv'),
    'production':  ('WPsCT_Input_production', 'World_Data_production.csv'),
}


#------------------------------------------------------------------------------
# Pipeline
#------------------------------------------------------------------------------
def generate(approaches=('consumption', 'production')):
    """Run the full raw-FAOSTAT -> global-dataset pipeline for the given approaches."""
    os.chdir(HERE)                                   # so all relative paths resolve
    WORLD_DATA_DIR.mkdir(parents=True, exist_ok=True)

    print('=' * 70)
    print('WPsC Tracker - Data Generator')
    print(f'  FAOSTAT input : {wf.FAO_CSV}')
    print(f'  Parameters    : {PARA_FILE}')
    print(f'  Output folder : {WORLD_DATA_DIR}')
    print('=' * 70)

    # 1. raw FAOSTAT -> per-country inputs (both approaches)
    print('\n[1/2] Converting FAOSTAT data into per-country inputs ...')
    wf.main(approaches=approaches)

    # 2. per-country inputs -> one combined dataset per approach
    print('\n[2/2] Running the tracker for each approach ...')
    for approach in approaches:
        input_dir, out_name = APPROACHES[approach]
        out_path = WORLD_DATA_DIR / out_name
        print(f'\n  -> {approach}:  {input_dir}/  ->  {out_path.name}')
        wf.run_all_countries(
            input_dir   = input_dir,
            para_file   = PARA_FILE,
            output_file = str(out_path),
        )

    print('\nDone. Both datasets written to:', WORLD_DATA_DIR)


if __name__ == '__main__':
    generate()
