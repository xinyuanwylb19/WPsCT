function onReady(fn){ if(document.readyState!=='loading'){ fn(); } else { document.addEventListener('DOMContentLoaded', fn); } }

/* Small labeled value tile used by the live carbon-estimate panels. */
function statTile(label, value){
  return '<div class="rounded-xl border border-gray-200 px-3 py-2">' +
           '<div class="text-xs text-gray-500">' + label + '</div>' +
           '<div class="text-lg font-semibold text-gray-800">' + value + '</div>' +
         '</div>';
}

      (function() {
        'use strict';

        /* =========================================================
           JavaScript sections ordered to match the tab order above.
           HTML tab panels are organized from 1 to 6 for easier editing.
           ========================================================= */

        /* 4. Global WPs Carbon tab */
                // All country/region results live in ONE combined file (with a Country column).
        // Try the local copy first (same-origin), then the GitHub raw fallback.
        let glApproach = 'consumption';   // 'consumption' (P+I-E) or 'production' (P only)
        function worldDataUrls(ap){
          const fn = (ap==='production') ? 'World_Data_production.csv' : 'World_Data_consumption.csv';
          return [ 'data/World_Data/'+fn,
                   'https://raw.githubusercontent.com/xinyuanwylb19/xinyuanwylb19-Wood-Products-Carbon-Tracker/main/data/World_Data/'+fn ];
        }
        let glCacheByApproach = {};   // approach -> {country: rows}
        let glDataPromises = {};      // approach -> Promise
        // quote-aware CSV line split (country/region names can contain commas)
        function glParseLine(line){
          const out=[]; let cur=''; let q=false;
          for(let i=0;i<line.length;i++){ const c=line[i];
            if(q){ if(c==='\"'){ if(line[i+1]==='\"'){cur+='\"';i++;} else q=false; } else cur+=c; }
            else { if(c==='\"') q=true; else if(c===',') { out.push(cur); cur=''; } else cur+=c; }
          }
          out.push(cur); return out;
        }
        // Fetch + parse the combined file once; fill globalCountryCache = {name: rows}.
        async function glLoadAllData(){
          const ap = glApproach;
          if (glCacheByApproach[ap]) { globalCountryCache = glCacheByApproach[ap]; return globalCountryCache; }
          if (glDataPromises[ap]) return glDataPromises[ap];
          glDataPromises[ap] = (async () => {
            let text=null;
            for (const u of worldDataUrls(ap)){
              try { const r=await fetch(u); if(r.ok){ text=await r.text(); break; } } catch(e){}
            }
            if (text==null) throw new Error('World data file could not be loaded');
            const rows=text.split(/\r?\n/).filter(l=>l.length);
            const headers=glParseLine(rows[0]);
            const data={};
            for (let i=1;i<rows.length;i++){
              const vals=glParseLine(rows[i]); const country=vals[0]; const obj={}; let ok=true;
              headers.forEach((h,j)=>{ if(h==='Country') return; const v=parseFloat(vals[j]); if(h==='Year'&&isNaN(v)) ok=false; obj[h]=isNaN(v)?0:v; });
              if(ok){ (data[country]=data[country]||[]).push(obj); }
            }
            glCacheByApproach[ap] = data; globalCountryCache = data;
            return data;
          })();
          return glDataPromises[ap];
        }
        window.glSetApproach = async function(ap){
          if (ap===glApproach) return;
          glApproach = ap;
          ['consumption','production'].forEach(x=>{ const b=document.getElementById('gl-appr-'+x);
            if(b) b.className='px-3 py-1 transition-colors text-xs font-semibold '+(x===ap?'bg-indigo-600 text-white':'bg-white text-gray-500 hover:bg-indigo-50'); });
          const dsc=document.getElementById('gl-appr-desc');
          if(dsc) dsc.textContent = (ap==='production')
            ? 'Production = made from domestically-harvested wood (exports retained, imports excluded).'
            : 'Consumption = production + imports - exports (carbon held in-country).';
          glMapStatus('Loading '+ap+' dataset…');
          try { await glLoadAllData(); } catch(e){ glMapStatus('Could not load the '+ap+' dataset.'); return; }
          glMapStatus('');
          if (globalMapLoaded) glUpdateMap();
          if (globalSelectedLocation && globalCountryCache[globalSelectedLocation]){
            globalSelectedData = globalCountryCache[globalSelectedLocation];
            glRenderAll(globalSelectedData, globalSelectedLocation);
          }
          appUpdateHash();
        };
        const IN_USE_COLS  = ['Construction_InUse','Exterior_InUse','Household_InUse',
                              'GraphicPaper_InUse','HouseholdPaper_InUse','OtherPaper_InUse'];
        const COLORS = {
          Construction:'#1d4ed8', Exterior:'#0891b2', Household:'#7c3aed',
          GraphicPaper:'#059669', HouseholdPaper:'#65a30d', OtherPaper:'#16a34a',
          Landfill:'#92400e', Biochar:'#78350f',
          FuelEmis:'#f97316', LFDecay:'#b45309', BCDecay:'#a16207'
        };
        const LABELS = {
          Construction:'Construction', Exterior:'Exterior', Household:'Household',
          GraphicPaper:'Graphic Paper', HouseholdPaper:'Household Paper', OtherPaper:'Other Paper',
          Landfill:'Landfill Stock', Biochar:'Biochar Stock',
          FuelEmis:'Biofuel Emissions', LFDecay:'Landfill Decay',
          BCDecay:'Biochar Decay'
        };

        const GL_COUNTRIES = ["Afghanistan","Albania","Algeria","American Samoa","Andorra","Angola","Anguilla","Antigua and Barbuda","Argentina","Armenia","Aruba","Ascension, Saint Helena and Tristan da Cunha","Australia","Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belgium-Luxembourg","Belize","Benin","Bermuda","Bhutan","Bolivia (Plurinational State of)","Bosnia and Herzegovina","Botswana","Brazil","British Virgin Islands","Brunei Darussalam","Bulgaria","Burkina Faso","Burundi","Cabo Verde","Cambodia","Cameroon","Canada","Cayman Islands","Central African Republic","Chad","Chile","China","China, Hong Kong SAR","China, Macao SAR","China, Taiwan Province of","China, mainland","Christmas Island","Cocos (Keeling) Islands","Colombia","Comoros","Congo","Cook Islands","Costa Rica","Croatia","Cuba","Curaçao","Cyprus","Czechia","Czechoslovakia","Côte d'Ivoire","Democratic People's Republic of Korea","Democratic Republic of the Congo","Denmark","Djibouti","Dominica","Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea","Estonia","Eswatini","Ethiopia","Ethiopia PDR","Falkland Islands (Malvinas)","Faroe Islands","Fiji","Finland","France","French Guiana","French Polynesia","French Southern Territories","Gabon","Gambia","Georgia","Germany","Ghana","Gibraltar","Greece","Greenland","Grenada","Guadeloupe","Guam","Guatemala","Guinea","Guinea-Bissau","Guyana","Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran (Islamic Republic of)","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait","Kyrgyzstan","Lao People's Democratic Republic","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Marshall Islands","Martinique","Mauritania","Mauritius","Mayotte","Melanesia","Mexico","Micronesia","Micronesia (Federated States of)","Mongolia","Montenegro","Montserrat","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal","Netherlands (Kingdom of the)","Netherlands Antilles (former)","New Caledonia","New Zealand","Nicaragua","Niger","Nigeria","Niue","Norfolk Island","North Macedonia","Northern Mariana Islands","Norway","Oman","Pacific Islands Trust Territory","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Pitcairn","Poland","Polynesia","Portugal","Qatar","Republic of Korea","Republic of Moldova","Romania","Russian Federation","Rwanda","Réunion","Saint Kitts and Nevis","Saint Lucia","Saint Martin (French part)","Saint Pierre and Miquelon","Saint Vincent and the Grenadines","Samoa","Sao Tome and Principe","Saudi Arabia","Senegal","Serbia","Serbia and Montenegro","Seychelles","Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa","South America","South Sudan","Spain","Sri Lanka","Sudan","Sudan (former)","Suriname","Sweden","Switzerland","Syrian Arab Republic","Tajikistan","Thailand","Timor-Leste","Togo","Tokelau","Tonga","Trinidad and Tobago","Tunisia","Turkmenistan","Turks and Caicos Islands","Tuvalu","Türkiye","USSR","Uganda","Ukraine","United Arab Emirates","United Kingdom of Great Britain and Northern Ireland","United Republic of Tanzania","United States of America","Uruguay","Uzbekistan","Vanuatu","Venezuela (Bolivarian Republic of)","Viet Nam","Wallis and Futuna Islands","Western Sahara","Yemen","Yugoslav SFR","Zambia","Zimbabwe"];
        const GL_REGIONS = ["Africa","Americas","Asia","Australia and New Zealand","Caribbean","Central America","Central Asia","Eastern Africa","Eastern Asia","Eastern Europe","Europe","European Union (27)","Land Locked Developing Countries (LLDCs)","Least Developed Countries (LDCs)","Low Income Food Deficit Countries (LIFDCs)","Middle Africa","Net Food Importing Developing Countries (NFIDCs)","Northern Africa","Northern America","Northern Europe","Oceania","Small Island Developing States (SIDS)","South-eastern Asia","Southern Africa","Southern Asia","Southern Europe","Western Africa","Western Asia","Western Europe","World"];

        const NAME_TO_ISO3 = {
          'Türkiye':'TUR',
          'North Macedonia':'MKD',
          'Liechtenstein':'LIE',
          'Afghanistan':'AFG',
          'Albania':'ALB',
          'Algeria':'DZA',
          'American Samoa':'ASM',
          'Andorra':'AND',
          'Angola':'AGO',
          'Anguilla':'AIA',
          'Antigua and Barbuda':'ATG',
          'Argentina':'ARG',
          'Armenia':'ARM',
          'Aruba':'ABW',
          'Ascension, Saint Helena and Tristan da Cunha':'SHN',
          'Australia':'AUS',
          'Austria':'AUT',
          'Azerbaijan':'AZE',
          'Bahamas':'BHS',
          'Bahrain':'BHR',
          'Bangladesh':'BGD',
          'Barbados':'BRB',
          'Belarus':'BLR',
          'Belgium':'BEL',
          'Belgium-Luxembourg':'BEL',
          'Belize':'BLZ',
          'Benin':'BEN',
          'Bermuda':'BMU',
          'Bhutan':'BTN',
          'Bolivia (Plurinational State of)':'BOL',
          'Bosnia and Herzegovina':'BIH',
          'Botswana':'BWA',
          'Brazil':'BRA',
          'British Virgin Islands':'VGB',
          'Brunei Darussalam':'BRN',
          'Bulgaria':'BGR',
          'Burkina Faso':'BFA',
          'Burundi':'BDI',
          'Cabo Verde':'CPV',
          'Cambodia':'KHM',
          'Cameroon':'CMR',
          'Canada':'CAN',
          'Cayman Islands':'CYM',
          'Central African Republic':'CAF',
          'Chad':'TCD',
          'Chile':'CHL',
          'China':'CHN',
          'China, Hong Kong SAR':'HKG',
          'China, Macao SAR':'MAC',
          'China, Taiwan Province of':'TWN',
          'China, mainland':'CHN',
          'Christmas Island':'CXR',
          'Cocos (Keeling) Islands':'CCK',
          'Colombia':'COL',
          'Comoros':'COM',
          'Congo':'COG',
          'Cook Islands':'COK',
          'Costa Rica':'CRI',
          'Croatia':'HRV',
          'Cuba':'CUB',
          'Curaçao':'CUW',
          'Cyprus':'CYP',
          'Czechia':'CZE',
          'Czechoslovakia':'CZE',
          'Côte d\'Ivoire':'CIV',
          'Democratic People\'s Republic of Korea':'PRK',
          'Democratic Republic of the Congo':'COD',
          'Denmark':'DNK',
          'Djibouti':'DJI',
          'Dominica':'DMA',
          'Dominican Republic':'DOM',
          'Ecuador':'ECU',
          'Egypt':'EGY',
          'El Salvador':'SLV',
          'Equatorial Guinea':'GNQ',
          'Eritrea':'ERI',
          'Estonia':'EST',
          'Eswatini':'SWZ',
          'Ethiopia':'ETH',
          'Ethiopia PDR':'ETH',
          'Falkland Islands (Malvinas)':'FLK',
          'Faroe Islands':'FRO',
          'Fiji':'FJI',
          'Finland':'FIN',
          'France':'FRA',
          'French Guiana':'GUF',
          'French Polynesia':'PYF',
          'French Southern Territories':'ATF',
          'Gabon':'GAB',
          'Gambia':'GMB',
          'Georgia':'GEO',
          'Germany':'DEU',
          'Ghana':'GHA',
          'Gibraltar':'GIB',
          'Greece':'GRC',
          'Greenland':'GRL',
          'Grenada':'GRD',
          'Guadeloupe':'GLP',
          'Guam':'GUM',
          'Guatemala':'GTM',
          'Guinea':'GIN',
          'Guinea-Bissau':'GNB',
          'Guyana':'GUY',
          'Haiti':'HTI',
          'Honduras':'HND',
          'Hungary':'HUN',
          'Iceland':'ISL',
          'India':'IND',
          'Indonesia':'IDN',
          'Iran (Islamic Republic of)':'IRN',
          'Iraq':'IRQ',
          'Ireland':'IRL',
          'Israel':'ISR',
          'Italy':'ITA',
          'Jamaica':'JAM',
          'Japan':'JPN',
          'Jordan':'JOR',
          'Kazakhstan':'KAZ',
          'Kenya':'KEN',
          'Kiribati':'KIR',
          'Kuwait':'KWT',
          'Kyrgyzstan':'KGZ',
          'Lao People\'s Democratic Republic':'LAO',
          'Latvia':'LVA',
          'Lebanon':'LBN',
          'Lesotho':'LSO',
          'Liberia':'LBR',
          'Libya':'LBY',
          'Lithuania':'LTU',
          'Luxembourg':'LUX',
          'Madagascar':'MDG',
          'Malawi':'MWI',
          'Malaysia':'MYS',
          'Maldives':'MDV',
          'Mali':'MLI',
          'Malta':'MLT',
          'Marshall Islands':'MHL',
          'Martinique':'MTQ',
          'Mauritania':'MRT',
          'Mauritius':'MUS',
          'Mexico':'MEX',
          'Micronesia (Federated States of)':'FSM',
          'Mongolia':'MNG',
          'Montenegro':'MNE',
          'Montserrat':'MSR',
          'Morocco':'MAR',
          'Mozambique':'MOZ',
          'Myanmar':'MMR',
          'Namibia':'NAM',
          'Nauru':'NRU',
          'Nepal':'NPL',
          'Netherlands (Kingdom of the)':'NLD',
          'Netherlands Antilles (former)':'ANT',
          'New Caledonia':'NCL',
          'New Zealand':'NZL',
          'Nicaragua':'NIC',
          'Niger':'NER',
          'Nigeria':'NGA',
          'Niue':'NIU',
          'Norfolk Island':'NFK',
          'Norway':'NOR',
          'Oman':'OMN',
          'Pakistan':'PAK',
          'Palau':'PLW',
          'Palestine':'PSE',
          'Panama':'PAN',
          'Papua New Guinea':'PNG',
          'Paraguay':'PRY',
          'Peru':'PER',
          'Philippines':'PHL',
          'Poland':'POL',
          'Portugal':'PRT',
          'Qatar':'QAT',
          'Republic of Korea':'KOR',
          'Republic of Moldova':'MDA',
          'Romania':'ROU',
          'Russian Federation':'RUS',
          'Rwanda':'RWA',
          'Réunion':'REU',
          'Saint Kitts and Nevis':'KNA',
          'Saint Lucia':'LCA',
          'Saint Pierre and Miquelon':'SPM',
          'Saint Vincent and the Grenadines':'VCT',
          'Samoa':'WSM',
          'Sao Tome and Principe':'STP',
          'Saudi Arabia':'SAU',
          'Senegal':'SEN',
          'Serbia':'SRB',
          'Serbia and Montenegro':'SCG',
          'Seychelles':'SYC',
          'Sierra Leone':'SLE',
          'Singapore':'SGP',
          'Slovakia':'SVK',
          'Slovenia':'SVN',
          'Solomon Islands':'SLB',
          'Somalia':'SOM',
          'South Africa':'ZAF',
          'South Sudan':'SSD',
          'Spain':'ESP',
          'Sri Lanka':'LKA',
          'Sudan':'SDN',
          'Sudan (former)':'SDN',
          'Suriname':'SUR',
          'Sweden':'SWE',
          'Switzerland':'CHE',
          'Syrian Arab Republic':'SYR',
          'Tajikistan':'TJK',
          'Thailand':'THA',
          'Timor-Leste':'TLS',
          'Togo':'TGO',
          'Tokelau':'TKL',
          'Tonga':'TON',
          'Trinidad and Tobago':'TTO',
          'Tunisia':'TUN',
          'Turkmenistan':'TKM',
          'Tuvalu':'TUV',
          'Uganda':'UGA',
          'Ukraine':'UKR',
          'United Arab Emirates':'ARE',
          'United Kingdom of Great Britain and Northern Ireland':'GBR',
          'United Republic of Tanzania':'TZA',
          'United States of America':'USA',
          'Uruguay':'URY',
          'Uzbekistan':'UZB',
          'Vanuatu':'VUT',
          'Venezuela (Bolivarian Republic of)':'VEN',
          'Viet Nam':'VNM',
          'Wallis and Futuna Islands':'WLF',
          'Western Sahara':'ESH',
          'Yemen':'YEM',
          'Zambia':'ZMB',
          'Zimbabwe':'ZWE'
        };

        let globalUnit     = 'Tg';
        let globalSelectedLocation = null;
        let globalSelectedData     = null;      // parsed rows for selected location
        let globalMapData  = {};       // {countryName: {year: value}}
        let globalMapYears = [];
        let globalListTab  = 'country';
        let globalMapLoaded= false;

        function fromKg(v) {
          if (globalUnit==='Tg') return v/1e9;
          if (globalUnit==='Pg') return v/1e12;
          return v;
        }
        function unitLbl() { return globalUnit==='Tg'?'Tg C':globalUnit==='Pg'?'Pg C':'kg C'; }
        function fmtVal(v) {
          const x = fromKg(v);
          if (Math.abs(x)>=1000) return x.toFixed(0);
          if (Math.abs(x)>=10)   return x.toFixed(1);
          if (Math.abs(x)>=0.1)  return x.toFixed(2);
          return x.toExponential(2);
        }

        function glPopulateDropdowns() {
          const cSel = document.getElementById('gl-country-select');
          const rSel = document.getElementById('gl-region-select');
          if (cSel) {
            cSel.innerHTML = GL_COUNTRIES.map(n =>
              `<option value="${n}">${n}</option>`).join('');
          }
          if (rSel) {
            rSel.innerHTML = GL_REGIONS.map(n =>
              `<option value="${n}">${n}</option>`).join('');
          }
          const xSel = document.getElementById('gl-custom-select');
          if (xSel) xSel.innerHTML = GL_COUNTRIES.map(n => `<option value="${n}">${n}</option>`).join('');
        }

        window.glSwitchListTab = function(tab) {
          globalListTab = tab;
          ['country','region','custom'].forEach(t => {
            const btn = document.getElementById('gl-tab-'+t);
            const panel = document.getElementById('gl-'+t+'-panel');
            if (!btn||!panel) return;
            const active = t===tab;
            btn.className = 'flex-1 py-1.5 transition-colors ' +
              (active ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50');
            panel.classList.toggle('hidden', !active);
          });
        };

        window.glSelectLocation = async function(name) {
          if (!name) return;
          globalSelectedLocation = name;
          glMapStatus('Loading ' + name + '...');
          try {
            const all = await glLoadAllData();
            const rows = all[name];
            if (!rows || !rows.length) throw new Error('No data for ' + name);
            globalSelectedData = rows;
            glRenderAll(rows, name);
            glMapStatus('');
            appUpdateHash();
          } catch(e) {
            glMapStatus('Could not load data for ' + name + ': ' + e.message);
          }
        };


        function glRenderAll(rows, name) {
          const last = rows[rows.length-1];
          const lastYear = Math.round(last.Year);
          const totalInUse = IN_USE_COLS.reduce((s,c)=>s+(last[c]||0),0);
          const kpiBox = document.getElementById('gl-kpi-box');
          if (kpiBox) kpiBox.classList.remove('hidden');
          const setEl = (id, val) => { const el=document.getElementById(id); if(el) el.textContent=val; };
          setEl('gl-kpi-title', name + ' (' + lastYear + ')');
          setEl('gl-kpi-inuse',   fmtVal(totalInUse)  + ' ' + unitLbl());
          setEl('gl-kpi-lf',      fmtVal(last.LF_Stock_Total||0)  + ' ' + unitLbl());
          setEl('gl-kpi-biochar', fmtVal(last.Biochar_Stock||0)   + ' ' + unitLbl());
          setEl('gl-kpi-emis',    fmtVal(last.Fuel_Emissions||0)  + ' ' + unitLbl());
          setEl('gl-kpi-year-note', 'Latest year: ' + lastYear);

          glDrawStockChart(rows);
          glDrawEmisChart(rows);
          glDrawSankey(rows, name);
          glValRefresh();
          glDrawTable(rows, name);
          const dlBtn = document.getElementById('gl-dl-btn');
          if (dlBtn) dlBtn.classList.remove('hidden');
        }

        function glDrawStockChart(rows) {
          const years = rows.map(r=>r.Year);
          const traces = [];
          const sg = (typeof glStockMode!=='undefined' && glStockMode==='stacked') ? 'one' : undefined;
          const inUseDefs = [
            ['Construction_InUse','Construction'],
            ['Exterior_InUse','Exterior'],
            ['Household_InUse','Household'],
            ['GraphicPaper_InUse','GraphicPaper'],
            ['HouseholdPaper_InUse','HouseholdPaper'],
            ['OtherPaper_InUse','OtherPaper']
          ];
          inUseDefs.forEach(([col,key]) => {
            traces.push({ x:years, y:rows.map(r=>fromKg(r[col]||0)),
              mode:'lines', name:LABELS[key], stackgroup:sg,
              line:{color:COLORS[key],width:2},
              hovertemplate:'%{y:.3f} '+unitLbl()+'<extra>'+LABELS[key]+'</extra>' });
          });
          traces.push({ x:years, y:rows.map(r=>fromKg(r.LF_Stock_Total||0)),
            mode:'lines', name:LABELS.Landfill, stackgroup:sg,
            line:{color:COLORS.Landfill,width:2,dash:sg?'solid':'dot'},
            hovertemplate:'%{y:.3f} '+unitLbl()+'<extra>'+LABELS.Landfill+'</extra>' });
          traces.push({ x:years, y:rows.map(r=>fromKg(r.Biochar_Stock||0)),
            mode:'lines', name:LABELS.Biochar, stackgroup:sg,
            line:{color:COLORS.Biochar,width:2,dash:sg?'solid':'dash'},
            hovertemplate:'%{y:.3f} '+unitLbl()+'<extra>'+LABELS.Biochar+'</extra>' });

          Plotly.newPlot('gl-chart-stock', traces, glLayout(
            'Year', 'Carbon Storage (' + unitLbl() + ')'),
            {responsive:true,displayModeBar:true,
              modeBarButtonsToRemove:['select2d','lasso2d'],displaylogo:false,
              toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_global'}});
        }

        function glDrawEmisChart(rows) {
          const years = rows.map(r=>r.Year);
          const showEmis  = document.getElementById('glv-emis')?.checked ?? false;
          const showLFD   = document.getElementById('glv-lfdecay')?.checked ?? true;
          const showBCD   = document.getElementById('glv-bcdecay')?.checked ?? false;

          const mk = (col,key,vis) => ({
            x:years, y:rows.map(r=>fromKg(r[col]||0)),
            mode:'lines', name:LABELS[key],
            visible: vis ? true : 'legendonly',
            line:{color:COLORS[key],width:2},
            hovertemplate:'%{y:.3f} '+unitLbl()+'/yr<extra>'+LABELS[key]+'</extra>'
          });
          const traces = [
            mk('Fuel_Emissions','FuelEmis', showEmis),
            mk('LF_Decay_Total','LFDecay',  showLFD),
            mk('Biochar_Decay','BCDecay',   showBCD),
          ];
          Plotly.newPlot('gl-chart-emis', traces, glLayout(
            'Year', 'Carbon Flux (' + unitLbl() + '/yr)'),
            {responsive:true,displayModeBar:true,
              modeBarButtonsToRemove:['select2d','lasso2d'],displaylogo:false,
              toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_global'}});
        }

        function glLayout(xtitle, ytitle) {
          return {
            autosize:true, margin:{l:65,r:20,t:15,b:85},
            paper_bgcolor:'#f9fafb', plot_bgcolor:'#ffffff',
            font:{family:'Inter, system-ui, sans-serif',size:14,color:'#374151'},
            legend:{orientation:'h',y:-0.32,x:0,font:{size:13},bgcolor:'rgba(0,0,0,0)'},
            hovermode:'x unified',
            hoverlabel:{bgcolor:'#1e293b',font:{color:'#f8fafc',size:11},bordercolor:'#334155'},
            xaxis:{title:{text:xtitle,standoff:8},showgrid:true,gridcolor:'#f3f4f6',zeroline:false},
            yaxis:{title:{text:ytitle,standoff:8},showgrid:true,gridcolor:'#f3f4f6',zeroline:false,separatethousands:true},
          };
        }

        function glDrawTable(rows, name) {
          const last10 = rows.slice(-10);
          const tTitle = document.getElementById('gl-table-title');
          if (tTitle) tTitle.textContent = '- ' + name;
          let html = '<table style="border-collapse:collapse;width:100%;font-size:0.75rem">';
          html += '<thead><tr style="background:#f1f5f9">';
          ['Year','Total In-Use','Landfill Stock','Biochar Stock',
           'Fuel Emissions','LF Decay','Unit'].forEach(h => {
            html += `<th style="border:1px solid #e2e8f0;padding:3px 8px;text-align:right;white-space:nowrap">${h}</th>`;
          });
          html += '</tr></thead><tbody>';
          last10.forEach((r,i) => {
            const bg = i%2===0?'#fff':'#f8fafc';
            const inUse = IN_USE_COLS.reduce((s,c)=>s+(r[c]||0),0);
            html += `<tr style="background:${bg}">`;
            [r.Year, inUse, r.LF_Stock_Total||0, r.Biochar_Stock||0,
             r.Fuel_Emissions||0, r.LF_Decay_Total||0].forEach((v,j) => {
              const d = j===0 ? Math.round(v) : (fmtVal(v));
              html += `<td style="border:1px solid #e2e8f0;padding:3px 8px;text-align:right">${d}</td>`;
            });
            html += `<td style="border:1px solid #e2e8f0;padding:3px 8px;text-align:center;color:#9ca3af">${unitLbl()}</td>`;
            html += '</tr>';
          });
          html += '</tbody></table>';
          const el = document.getElementById('gl-table');
          if (el) el.innerHTML = html;
        }

        window.glDownloadCSV = function() {
          if (!globalSelectedData||!globalSelectedLocation) return;
          const headers = Object.keys(globalSelectedData[0]);
          let csv = headers.join(',')+'\n';
          globalSelectedData.forEach(r => { csv += headers.map(h=>r[h]).join(',')+'\n'; });
          const blob = new Blob([csv],{type:'text/csv'});
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = globalSelectedLocation.replace(/ /g,'_')+'_WPsCT.csv';
          a.click();
        };

        window.glSetUnit = function(u) {
          globalUnit = u;
          ['Tg','Pg','kg'].forEach(x => {
            const b = document.getElementById('gl-u-'+x.toLowerCase());
            if (!b) return;
            b.className = 'px-2 py-1 transition-colors ' +
              (x===u ? 'bg-indigo-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50');
          });
          if (globalSelectedData) glRenderAll(globalSelectedData, globalSelectedLocation||'');
          if (globalMapLoaded) glUpdateMap();
          appUpdateHash();
        };

        let globalCountryCache = {}; // name -> rows

        async function glLoadCountryForMap(name) {
          const all = await glLoadAllData();
          return all[name] || null;
        }

        async function glBuildMapData() {
          glMapStatus('Building map - loading data...');
          await glLoadAllData();
          await glLoadLookup();
          globalMapLoaded = true;
          glMapStatus('');
          glUpdateMap();
        }

        let glMapYear = null;   // null = use the latest year
        window.glSetMapYear = function(y){
          glMapYear = parseInt(y, 10);
          const lbl = document.getElementById('gl-map-year-lbl'); if (lbl) lbl.textContent = y;
          if (globalMapLoaded) glUpdateMap();
        };
        // ---- Map normalization lookup (bundled population + forest area) ----
        let glLookup = null;   // iso3 -> {pop, forest}
        async function glLoadLookup(){
          if (glLookup) return glLookup;
          glLookup = {};
          try {
            const r = await fetch('data/Country_Lookup.csv?v='+Date.now());
            if (r.ok){
              const lines = (await r.text()).split(/\r?\n/).filter(l=>l.trim().length);
              const H = glParseLine(lines[0]);
              const iI=H.indexOf('ISO3'), pI=H.indexOf('Population'), fI=H.indexOf('ForestArea_km2');
              for (let i=1;i<lines.length;i++){ const c=glParseLine(lines[i]);
                const pop=parseFloat(c[pI]), forest=parseFloat(c[fI]);
                glLookup[c[iI]] = { pop: isNaN(pop)?null:pop, forest: isNaN(forest)?null:forest };
              }
            }
          } catch(e){ console.error('lookup load failed', e); }
          return glLookup;
        }
        let glMapYearA = 1990;   // baseline year for difference mode
        let glMapDiff  = false;
        window.glSetMapYearA = function(y){
          glMapYearA = parseInt(y,10);
          const lbl=document.getElementById('gl-map-yearA-lbl'); if(lbl) lbl.textContent=y;
          if (globalMapLoaded) glUpdateMap();
        };
        window.glToggleDiff = function(){
          glMapDiff = !!((document.getElementById('gl-map-diff')||{}).checked);
          const w=document.getElementById('gl-map-yearA-wrap');
          if (w) w.style.display = glMapDiff ? 'inline-flex' : 'none';
          if (globalMapLoaded) glUpdateMap();
        };
        function glMapCarbonKg(row, metric){
          if (metric==='lf') return row.LF_Stock_Total||0;
          if (metric==='biochar') return row.Biochar_Stock||0;
          return IN_USE_COLS.reduce((s,c)=>s+(row[c]||0),0);
        }
        // normalized display value for a country at a given year (null if unavailable)
        function glMapValue(rows, iso, year, metric, norm){
          const row = (year ? (rows.find(r=>r.Year===year) || rows[rows.length-1]) : rows[rows.length-1]);
          if (!row) return null;
          const kg = glMapCarbonKg(row, metric);
          if (norm==='percapita'){ const L=glLookup&&glLookup[iso]; if(!L||!L.pop) return null; return (kg/1000)/L.pop; }       // t C / person
          if (norm==='perarea'){   const L=glLookup&&glLookup[iso]; if(!L||!L.forest) return null; return (kg/1000)/L.forest; }  // t C / km² forest
          return fromKg(kg);   // absolute, in current display unit
        }
        function glNormUnit(norm){ return norm==='percapita' ? 't C / person' : norm==='perarea' ? 't C / km² forest' : unitLbl(); }
        window.glUpdateMap = function() {
          if (!globalMapLoaded) return;
          const metric = (document.getElementById('gl-map-metric')||{}).value || 'inuse';
          const norm   = (document.getElementById('gl-map-norm')||{}).value || 'absolute';
          const yearB  = glMapYear;
          const isos=[], z=[], hov=[], names=[];
          for (const [name, iso] of Object.entries(NAME_TO_ISO3)) {
            const rows = globalCountryCache[name];
            if (!rows) continue;
            let val;
            if (glMapDiff){
              const a = glMapValue(rows, iso, glMapYearA, metric, norm);
              const b = glMapValue(rows, iso, yearB, metric, norm);
              if (a==null || b==null) continue;
              val = b - a;
              isos.push(iso); names.push(name); z.push(val); hov.push(val);
            } else {
              val = glMapValue(rows, iso, yearB, metric, norm);
              if (val==null) continue;
              isos.push(iso); names.push(name); z.push(val>0?Math.log10(val):null); hov.push(val);
            }
          }
          const metricLabels = {inuse:'Total In-Use Stock',lf:'Landfill Stock',biochar:'Biochar Stock'};
          const unit = glNormUnit(norm);
          let trace;
          if (glMapDiff){
            const zabs = Math.max(1e-9, ...z.map(v=>Math.abs(v)));
            trace = { type:'choropleth', locationmode:'ISO-3', locations:isos, z:z,
              zmin:-zabs, zmax:zabs, zmid:0, customdata:hov, text:names,
              colorscale:'RdBu', reversescale:true,
              colorbar:{ title:'Δ '+metricLabels[metric]+'  '+glMapYearA+'→'+(yearB||2024)+'  ('+unit+')',
                titleside:'right', thickness:12, len:0.7, titlefont:{size:16}, tickfont:{size:16} },
              hovertemplate:'<b>%{text}</b><br>Δ: %{customdata:.3s} '+unit+'<extra></extra>',
              marker:{line:{color:'#ffffff',width:0.5}} };
          } else {
            const zf=z.filter(x=>x!=null);
            const zlo=zf.length?Math.floor(Math.min(...zf)):0, zhi=zf.length?Math.ceil(Math.max(...zf)):1;
            const tickvals=[], ticktext=[];
            for (let k=zlo;k<=zhi;k++){ const t=Math.pow(10,k); tickvals.push(k); ticktext.push(t>=1?t.toLocaleString('en-US'):String(t)); }
            trace = { type:'choropleth', locationmode:'ISO-3', locations:isos, z:z,
              zmin:zlo, zmax:zhi, customdata:hov, text:names, colorscale:'Viridis',
              colorbar:{ title:metricLabels[metric]+' ('+unit+', log)', titleside:'right',
                thickness:12, len:0.7, titlefont:{size:16}, tickfont:{size:16}, tickvals:tickvals, ticktext:ticktext },
              hovertemplate:'<b>%{text}</b><br>'+metricLabels[metric]+': %{customdata:.3s} '+unit+'<extra></extra>',
              marker:{line:{color:'#ffffff',width:0.5}} };
          }
          const layout = { autosize:true, margin:{l:0,r:0,t:5,b:0}, paper_bgcolor:'#f9fafb',
            geo:{ showframe:false, showcoastlines:true, coastlinecolor:'#d1d5db', showland:true, landcolor:'#f3f4f6',
              showocean:true, oceancolor:'#eff6ff', showlakes:true, lakecolor:'#eff6ff',
              showcountries:true, countrycolor:'#e5e7eb', projection:{type:'natural earth'} } };
          Plotly.newPlot('gl-map', [trace], layout, {responsive:true, displayModeBar:false});
          if (typeof glUpdateRanking === 'function') glUpdateRanking();
          const mapDiv = document.getElementById('gl-map');
          if (mapDiv) mapDiv.on('plotly_click', function(data){
            if (data.points && data.points.length>0){ const cn=data.points[0].text;
              if (cn){ const sel=document.getElementById('gl-country-select'); if(sel) sel.value=cn; glSwitchListTab('country'); glSelectLocation(cn); } }
          });
        };

        function glMapStatus(msg) {
          const el = document.getElementById('gl-map-status');
          if (el) el.textContent = msg;
        }

        ['glv-emis','glv-lfdecay','glv-bcdecay'].forEach(id => {
          document.addEventListener('change', e => {
            if (e.target && e.target.id === id && globalSelectedData) glDrawEmisChart(globalSelectedData);
          });
        });

        function glInit() {
          glPopulateDropdowns();
          setTimeout(glBuildMapData, 500);
        }

        onReady(function() {
          const origSwitch = window.switchTab;
          let glInitDone = false;
          window.switchTab = function(name, btn) {
            if (origSwitch) origSwitch(name, btn);
            if (name==='gwp' && !glInitDone) { glInitDone=true; glInit(); }
            appUpdateHash();
          };
          if (document.getElementById('tab-gwp')?.classList.contains('active')) {
            glInitDone = true; glInit();
          }
          setTimeout(appRestoreHash, 300);
        });


        /* ---- Carbon-flow Sankey (cumulative, mass-balanced) ---- */
        window.glResetMapView = function(){ if (globalMapLoaded) glUpdateMap(); };
        function glHexRGBA(hex, a){
          const h = hex.replace('#',''); const n = parseInt(h,16);
          const r = (n>>16)&255, g = (n>>8)&255, b = n&255;
          return 'rgba('+r+','+g+','+b+','+a+')';
        }
        function glDrawSankey(rows, name){
          const el = document.getElementById('gl-sankey'); if (!el) return;
          const includeBio = (document.getElementById('gl-sankey-bio') || {checked:false}).checked;
          const sum  = (c)=> rows.reduce((s,r)=>s+(r[c]||0),0);
          const last = rows[rows.length-1];
          const yr0 = Math.round(rows[0].Year), yr1 = Math.round(last.Year);
          const inUse = {
            Construction:last.Construction_InUse||0, Exterior:last.Exterior_InUse||0, Household:last.Household_InUse||0,
            GraphicPaper:last.GraphicPaper_InUse||0, OtherPaper:last.OtherPaper_InUse||0, HouseholdPaper:last.HouseholdPaper_InUse||0 };
          const prod = {
            Construction:inUse.Construction+sum('Construction_Disposed'), Exterior:inUse.Exterior+sum('Exterior_Disposed'),
            Household:inUse.Household+sum('Household_Disposed'), GraphicPaper:inUse.GraphicPaper+sum('GraphicPaper_Disposed'),
            OtherPaper:inUse.OtherPaper+sum('OtherPaper_Disposed'), HouseholdPaper:inUse.HouseholdPaper+sum('HouseholdPaper_Disposed') };
          const solidInUseEnd = inUse.Construction+inUse.Exterior+inUse.Household;
          const paperInUseEnd = inUse.GraphicPaper+inUse.OtherPaper+inUse.HouseholdPaper;
          const solidDisposed = sum('Construction_Disposed')+sum('Exterior_Disposed')+sum('Household_Disposed');
          const paperDisposed = sum('GraphicPaper_Disposed')+sum('OtherPaper_Disposed')+sum('HouseholdPaper_Disposed');
          const recycled   = sum('Construction_Recycled')+sum('Household_Recycled')+sum('GraphicPaper_Recycled')+sum('OtherPaper_Recycled');
          const landfillIn = sum('LF_Input_Total');
          const lfStockEnd = last.LF_Stock_Total||0, lfDecay = sum('LF_Decay_Total');
          const bcStockEnd = last.Biochar_Stock||0,  bcDecay = sum('Biochar_Decay');
          const bcPoolIn   = bcStockEnd + bcDecay, fuelEmis = sum('Fuel_Emissions');
          const u = (v)=>fromKg(v);
          const COL = { 'Construction':'#1d4ed8','Exterior':'#0891b2','Household':'#7c3aed',
            'Graphic Paper':'#059669','Other Paper':'#65a30d','Household Paper':'#16a34a','Biofuel':'#f59e0b',
            'Solid wood - in use':'#3b82f6','Paper - in use':'#10b981','Disposed':'#9ca3af','Landfill':'#92400e',
            'Biochar':'#78350f','Retained in use':'#4f46e5','Recycled':'#14b8a6','Landfill stock':'#b45309',
            'Biochar stock':'#a16207','Emissions':'#ef4444' };
          const nodes=[], nodeColor=[], idx={};
          const NI=(label)=>{ if(!(label in idx)){ idx[label]=nodes.length; nodes.push(label); nodeColor.push(COL[label]||'#9ca3af'); } return idx[label]; };
          const S=[],T=[],V=[],LC=[];
          const link=(src,tgt,v)=>{ if(v>0){ const s=NI(src), t2=NI(tgt); S.push(s);T.push(t2);V.push(u(v));LC.push(glHexRGBA(COL[src]||'#9ca3af',0.32)); } };
          link('Construction','Solid wood - in use',prod.Construction);
          link('Exterior','Solid wood - in use',prod.Exterior);
          link('Household','Solid wood - in use',prod.Household);
          link('Graphic Paper','Paper - in use',prod.GraphicPaper);
          link('Other Paper','Paper - in use',prod.OtherPaper);
          link('Household Paper','Paper - in use',prod.HouseholdPaper);
          link('Solid wood - in use','Retained in use',solidInUseEnd);
          link('Solid wood - in use','Disposed',solidDisposed);
          link('Paper - in use','Retained in use',paperInUseEnd);
          link('Paper - in use','Disposed',paperDisposed);
          link('Disposed','Recycled',recycled);
          link('Disposed','Landfill',landfillIn);
          link('Landfill','Landfill stock',lfStockEnd);
          link('Landfill','Emissions',lfDecay);
          if (includeBio){
            link('Biofuel','Biochar',bcPoolIn);
            link('Biofuel','Emissions',fuelEmis);
            link('Biochar','Biochar stock',bcStockEnd);
            link('Biochar','Emissions',bcDecay);
          }
          const tEl = document.getElementById('gl-sankey-title'); if (tEl) tEl.textContent = '- ' + name;
          const sub = document.getElementById('gl-sankey-sub');
          const totalIn = u(prod.Construction+prod.Exterior+prod.Household+prod.GraphicPaper+prod.OtherPaper+prod.HouseholdPaper + (includeBio ? bcPoolIn+fuelEmis : 0));
          if (sub) sub.textContent = 'Cumulative carbon flows, ' + yr0 + '-' + yr1 + (includeBio ? '' : ' (biofuel excluded)') + '. Total routed: ' + (totalIn>=10?totalIn.toFixed(0):totalIn.toFixed(2)) + ' ' + unitLbl() + '.';
          Plotly.newPlot('gl-sankey', [{
            type:'sankey', arrangement:'snap', orientation:'h',
            valueformat:'.3g', valuesuffix:' '+unitLbl(),
            node:{ label:nodes, color:nodeColor, pad:16, thickness:18,
                   line:{color:'#e5e7eb',width:0.5},
                   hovertemplate:'%{label}<br>%{value}<extra></extra>' },
            link:{ source:S, target:T, value:V, color:LC,
                   hovertemplate:'%{source.label} → %{target.label}<br>%{value}<extra></extra>' }
          }], { margin:{l:10,r:10,t:10,b:10},
                font:{family:'Inter, system-ui, sans-serif', size:14, color:'#374151'},
                paper_bgcolor:'#ffffff' },
            {responsive:true, displayModeBar:true, displaylogo:false,
             modeBarButtonsToRemove:['select2d','lasso2d'],
             toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_sankey_'+String(name).replace(/[^a-z0-9]+/gi,'_')}});
        }
        window.glToggleSankeyBio = function(){ if (globalSelectedData) glDrawSankey(globalSelectedData, globalSelectedLocation||''); };


        /* ---- Validation overlay: model vs reference series ---- */
        let glValRef = null;   // {label, byYear:{year:kg}, synthetic:bool}
        function glToKg(v){ return globalUnit==='Tg'? v*1e9 : globalUnit==='Pg'? v*1e12 : v; }
        function glValModeled(rows){
          const m = (document.getElementById('gl-val-metric')||{}).value || 'inuse';
          return rows.map(r=>{
            let v = IN_USE_COLS.reduce((s,c)=>s+(r[c]||0),0);
            if (m==='inuse_lf') v += (r.LF_Stock_Total||0);
            else if (m==='total') v += (r.LF_Stock_Total||0)+(r.Biochar_Stock||0);
            return { year: Math.round(r.Year), kg: v };
          });
        }
        function glValRefresh(){
          const plotEl = document.getElementById('gl-val-plot'); if (!plotEl) return;
          const tEl = document.getElementById('gl-val-title');
          if (tEl) tEl.textContent = globalSelectedLocation ? ('- '+globalSelectedLocation) : '';
          const sEl = document.getElementById('gl-val-stats');
          if (!globalSelectedData){
            Plotly.purge(plotEl);
            if (sEl) sEl.textContent = 'Select a country, then upload a reference series (a table with Year, Value columns) or load the example.';
            return;
          }
          const modeled = glValModeled(globalSelectedData);
          const traces = [{ x:modeled.map(d=>d.year), y:modeled.map(d=>fromKg(d.kg)),
            mode:'lines', name:'Model', line:{color:'#4f46e5',width:2.5},
            hovertemplate:'%{y:.3f} '+unitLbl()+'<extra>Model</extra>' }];
          let statsTxt = 'Upload a reference series (a table with Year, Value columns) or load the example to compare.';
          if (glValRef){
            const refYears = Object.keys(glValRef.byYear).map(Number).sort((a,b)=>a-b);
            traces.push({ x:refYears, y:refYears.map(y=>fromKg(glValRef.byYear[y])),
              mode:'lines+markers', name:glValRef.label,
              line:{color:'#ea580c',width:2,dash:'dash'}, marker:{size:6,color:'#ea580c'},
              hovertemplate:'%{y:.3f} '+unitLbl()+'<extra>'+glValRef.label+'</extra>' });
            const modByYear = {}; modeled.forEach(d=>modByYear[d.year]=d.kg);
            let n=0, sumPct=0, sumSq=0;
            refYears.forEach(y=>{ const mo=modByYear[y];
              if (mo!=null && mo!==0){ const rf=glValRef.byYear[y]; sumPct += (rf-mo)/mo*100; sumSq += (rf-mo)*(rf-mo); n++; } });
            if (n){ const meanPct=sumPct/n, rmse=fromKg(Math.sqrt(sumSq/n));
              statsTxt = (glValRef.note ? glValRef.note + '  ·  ' : '') +
                'Matched years: '+n+'  ·  Mean difference: '+(meanPct>=0?'+':'')+meanPct.toFixed(1)+'% (reference vs model)  ·  RMSE: '+
                (rmse>=10?rmse.toFixed(1):rmse.toFixed(3))+' '+unitLbl();
            } else { statsTxt = 'No overlapping years between the reference series and the model.'; }
          }
          Plotly.newPlot('gl-val-plot', traces, glLayout('Year','Carbon ('+unitLbl()+')'),
            {responsive:true,displayModeBar:true,displaylogo:false,modeBarButtonsToRemove:['select2d','lasso2d'],
             toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_validation'}});
          if (sEl) sEl.textContent = statsTxt;
        }
        window.glValRefresh = glValRefresh;
        window.glValUpload = function(ev){
          const f = ev.target.files && ev.target.files[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = () => {
            try{
              const lines = String(reader.result).split(/\r?\n/).filter(l=>l.trim().length);
              if (!lines.length){ alert('Empty file.'); return; }
              const byYear = {}; let start = 0;
              if (isNaN(parseFloat(lines[0].split(',')[0]))) start = 1;   // skip header row
              for (let i=start;i<lines.length;i++){ const p=lines[i].split(','); const y=parseInt(p[0],10); const v=parseFloat(p[1]);
                if (!isNaN(y) && !isNaN(v)) byYear[y]=glToKg(v); }
              if (!Object.keys(byYear).length){ alert('No "Year,Value" rows found in the table.'); return; }
              glValRef = { label:'Reference: '+f.name, byYear, synthetic:false };
              glValRefresh();
            }catch(e){ console.error(e); alert('Could not read that file.'); }
          };
          reader.readAsText(f);
          ev.target.value = '';
        };
        // Published literature anchor points for cross-comparison (values in kg C; boundaries differ from this model).
        const GL_LIT_REFS = {
          world:    { location:'World', metric:'inuse', label:'Published: Zhang et al. (2020)',
                      note:'Global in-use HWP, cumulative since 1992 (narrower baseline than this model)',
                      byYear:{ 2015: 2938e9 } },
          usa:      { location:'United States of America', metric:'inuse', label:'Published: USDA / EPA inventory',
                      note:'US in-use HWP stock, 2019 (baseline and boundary differ)',
                      byYear:{ 2019: 1532e9 } },
          china:    { location:'China, mainland', metric:'inuse', label:'Published: Zhao et al. (2023)',
                      note:'China end-use HWP, accumulated 1961-2020',
                      byYear:{ 2020: 893e9 } },
          china_sr: { location:'China, mainland', metric:'inuse', label:'Published: Scientific Reports (2023)',
                      note:'China wood products (excludes bamboo), production approach, 1987-2020',
                      byYear:{ 2020: 328.7e9 } },
          japan:    { location:'Japan', metric:'inuse', label:'Published: Hashimoto and Moriguchi (2004)',
                      note:'Japan HWP stock, 1990 and 2000 (production approach)',
                      byYear:{ 1990: 284e9, 2000: 338e9 } }
        };
        window.glValLoadLit = async function(key){
          if(!key) return;
          const ref = GL_LIT_REFS[key]; if(!ref) return;
          const mSel = document.getElementById('gl-val-metric'); if(mSel) mSel.value = ref.metric;
          await glSelectLocation(ref.location);
          glValRef = { label: ref.label, byYear: ref.byYear, synthetic:false, note: ref.note };
          glValRefresh();
        };
        window.glValExample = function(){
          if (!globalSelectedData){ alert('Select a country or region first.'); return; }
          const modeled = glValModeled(globalSelectedData);
          let seed = 98765; const rnd = ()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
          const byYear = {};
          modeled.forEach((d,i)=>{ if (i%5!==0 && i!==modeled.length-1) return;   // sample ~every 5 yr
            const bias = 0.88 + 0.08*Math.sin(d.year/9);   // slow systematic offset ~0.80-0.96
            const noise = 1 + (rnd()-0.5)*0.06;            // small noise
            byYear[d.year] = Math.max(0, d.kg*bias*noise);
          });
          glValRef = { label:'Synthetic example', byYear, synthetic:true };
          glValRefresh();
        };
        window.glValClear = function(){ glValRef = null; glValRefresh(); };

        /* ---- Shareable view URLs (encode tab + Global selection in the hash) ---- */
        function appCurrentTab(){ const p=document.querySelector('.tab-panel.active'); return p ? (p.id||'').replace('tab-','') : null; }
        function appUpdateHash(){
          try{
            const tab=appCurrentTab(); if(!tab) return;
            const parts=['tab='+tab];
            if(tab==='gwp'){
              if(globalSelectedLocation) parts.push('loc='+encodeURIComponent(globalSelectedLocation));
              parts.push('appr='+glApproach); parts.push('unit='+globalUnit);
            }
            history.replaceState(null,'','#'+parts.join('&'));
          }catch(e){}
        }
        function appParseHash(){
          const hh=(location.hash||'').replace(/^#/,''); if(!hh) return {};
          const o={}; hh.split('&').forEach(kv=>{ const i=kv.indexOf('='); if(i>0) o[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1)); }); return o;
        }
        async function appRestoreHash(){
          const o=appParseHash(); if(!o.tab) return;
          const btn=Array.from(document.querySelectorAll('.tab-btn')).find(b=>(b.getAttribute('onclick')||'').includes("'"+o.tab+"'"));
          if(typeof switchTab==='function') switchTab(o.tab, btn||null);
          if(o.tab==='gwp'){
            if(o.unit && o.unit!==globalUnit && typeof glSetUnit==='function') glSetUnit(o.unit);
            if(o.appr && o.appr!==glApproach && typeof glSetApproach==='function'){ try{ await glSetApproach(o.appr); }catch(e){} }
            if(o.loc){ try{ await glSelectLocation(o.loc); const sel=document.getElementById('gl-country-select'); if(sel) sel.value=o.loc; }catch(e){} }
          }
        }

        /* ---- Multi-panel figure export (compose Global charts into one PNG) ---- */
        window.glExportPanel = async function(){
          if (!globalSelectedData){ alert('Select a country or region first so the charts are populated.'); return; }
          const defs=[['gl-chart-stock','Carbon storage over time'],
                      ['gl-chart-emis','Carbon emissions & decay'],
                      ['gl-sankey','Carbon-flow Sankey (cumulative)']];
          const shots=[];
          for(const [id,title] of defs){ const el=document.getElementById(id);
            if(!el || !el.data || !el.data.length) continue;
            try{ const uri=await Plotly.toImage(el,{format:'png',width:900,height:(id==='gl-sankey'?520:380),scale:2}); shots.push({uri,title}); }catch(e){}
          }
          if(!shots.length){ alert('No charts to export yet - select a country first.'); return; }
          const loaded=(await Promise.all(shots.map(o=>new Promise(res=>{ const im=new Image(); im.onload=()=>res({im,title:o.title}); im.onerror=()=>res(null); im.src=o.uri; })))).filter(Boolean);
          if(!loaded.length){ alert('Could not render the figure panel.'); return; }
          const pad=28, head=40, gap=24, topH=54;
          const W=Math.max(...loaded.map(o=>o.im.width));
          let totalH=topH; loaded.forEach(o=>{ totalH+=head+o.im.height+gap; });
          const c=document.createElement('canvas'); c.width=W+pad*2; c.height=totalH+pad;
          const ctx=c.getContext('2d');
          ctx.fillStyle='#ffffff'; ctx.fillRect(0,0,c.width,c.height);
          ctx.fillStyle='#111827'; ctx.font='bold 26px Inter, system-ui, sans-serif';
          ctx.fillText('WPsC Tracker - '+(globalSelectedLocation||''), pad, 38);
          ctx.fillStyle='#6b7280'; ctx.font='13px Inter, system-ui, sans-serif';
          ctx.fillText(glApproach.charAt(0).toUpperCase()+glApproach.slice(1)+' approach · unit '+unitLbl(), pad, 56);
          let y=topH;
          loaded.forEach(o=>{ ctx.fillStyle='#3730a3'; ctx.font='bold 16px Inter, system-ui, sans-serif';
            ctx.fillText(o.title, pad, y+22); y+=head;
            ctx.drawImage(o.im, pad, y); y+=o.im.height+gap; });
          const a=document.createElement('a'); a.href=c.toDataURL('image/png');
          a.download='WPsCT_panel_'+String(globalSelectedLocation||'figure').replace(/[^a-z0-9]+/gi,'_')+'.png'; a.click();
        };

      /* ===================== Global tab - Phase 2 additions ===================== */
      let glStockMode = 'lines';
      window.glToggleStockMode = function(){
        glStockMode = (glStockMode === 'lines') ? 'stacked' : 'lines';
        const b = document.getElementById('gl-stock-mode');
        if (b) b.textContent = (glStockMode === 'lines') ? 'Stacked' : 'Lines';
        if (globalSelectedData) glDrawStockChart(globalSelectedData);
      };

      // Top-N country ranking, driven by the current map metric + year.
      window.glUpdateRanking = function(){
        if (!globalCountryCache || !Object.keys(globalCountryCache).length) return;
        const metric = (document.getElementById('gl-map-metric')||{}).value || 'inuse';
        const N = parseInt((document.getElementById('gl-rank-n')||{}).value) || 15;
        const out = [];
        for (const name of GL_COUNTRIES){
          const data = globalCountryCache[name]; if (!data || !data.length) continue;
          const row = (glMapYear ? (data.find(r=>r.Year===glMapYear) || data[data.length-1]) : data[data.length-1]);
          let v = 0;
          if (metric==='inuse')   v = IN_USE_COLS.reduce((s,c)=>s+(row[c]||0),0);
          else if (metric==='lf') v = row.LF_Stock_Total||0;
          else if (metric==='biochar') v = row.Biochar_Stock||0;
          out.push([name, fromKg(v)]);
        }
        out.sort((a,b)=>b[1]-a[1]);
        const top = out.slice(0, N).reverse();
        const lbl = {inuse:'In-Use Stock', lf:'Landfill Stock', biochar:'Biochar Stock'}[metric];
        const ml = document.getElementById('gl-rank-metric-lbl'); if (ml) ml.textContent = lbl;
        const yl = document.getElementById('gl-rank-year-lbl');   if (yl) yl.textContent = glMapYear || 2024;
        Plotly.newPlot('gl-ranking', [{
          type:'bar', orientation:'h', x:top.map(r=>r[1]), y:top.map(r=>r[0]),
          marker:{color:'#4f46e5'}, hovertemplate:'%{y}<br>%{x:.3s} '+unitLbl()+'<extra></extra>'
        }], { font:{size:13}, margin:{l:170,r:20,t:8,b:40}, xaxis:{title:unitLbl(), separatethousands:true} },
          {responsive:true, displayModeBar:true, displaylogo:false,
           modeBarButtonsToRemove:['select2d','lasso2d'],
           toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_ranking'}});
      };

      // Custom group = sum of the selected countries, shown like any location.
      window.glBuildCustomGroup = function(){
        const sel = document.getElementById('gl-custom-select'); if (!sel) return;
        const names = Array.from(sel.selectedOptions).map(o=>o.value);
        if (!names.length){ alert('Select one or more countries (Ctrl/Cmd-click).'); return; }
        const base = globalCountryCache[names[0]]; if (!base) return;
        const cols = Object.keys(base[0]).filter(k=>k!=='Year');
        const byYear = {};
        names.forEach(nm=>{
          const data = globalCountryCache[nm]; if (!data) return;
          data.forEach(r=>{
            if (!byYear[r.Year]){ byYear[r.Year] = {Year:r.Year}; cols.forEach(c=>byYear[r.Year][c]=0); }
            cols.forEach(c=>byYear[r.Year][c] += (r[c]||0));
          });
        });
        const summed = Object.keys(byYear).sort((a,b)=>a-b).map(y=>byYear[y]);
        const label = 'Custom: ' + (names.length>3 ? names.slice(0,3).join(', ')+' +'+(names.length-3) : names.join(', '));
        globalSelectedLocation = label; globalSelectedData = summed;
        glRenderAll(summed, label);
      };

      // Bulk export - download the whole loaded dataset as one CSV.
      window.glDownloadAll = function(){
        if (!globalCountryCache || !Object.keys(globalCountryCache).length){ alert('Data is still loading - try again in a moment.'); return; }
        const names = Object.keys(globalCountryCache);
        const cols = Object.keys(globalCountryCache[names[0]][0]);
        let csv = 'Country,' + cols.join(',') + '\n';
        names.forEach(nm=>{
          const c = nm.indexOf(',')>=0 ? '"'+nm+'"' : nm;
          globalCountryCache[nm].forEach(r=>{ csv += c + ',' + cols.map(h=>r[h]).join(',') + '\n'; });
        });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
        a.download = 'WPsCT_World_Data_' + glApproach + '.csv'; a.click();
      };

      })(); // end IIFE

      /* 3. End-use Products tab */
      const statusEl   = document.getElementById('status');
      const progressEl = document.getElementById('progress');
      function setStatus(msg)  { statusEl.textContent   = msg; }
      function setProgress(msg){ progressEl.textContent = msg; }

      window.downloadParaTemplate = async function(){
        try{ const r=await fetch('runtime/WPs_Tracker_paras.csv?v='+Date.now()); const txt=await r.text();
          const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/csv'}));
          a.download='WPsCT_parameters_template.csv'; a.click();
        }catch(e){ alert('Could not load the parameter template.'); }
      };
      function toggleInputs(){
        document.getElementById('file-data').disabled  = !document.getElementById('rb-upload-data').checked;
        document.getElementById('file-paras').disabled = !document.getElementById('rb-upload-para').checked;
      }
      ['rb-me','rb-us','rb-upload-data','rb-default-para','rb-upload-para'].forEach(id=>{
        document.getElementById(id).addEventListener('change', toggleInputs);
      });
      toggleInputs();

      let pyodide  = null;
      let pyReady  = false;
      let pyLoading = false;

      function enableRunButtons(enable){
        ['btn-run','btn-plot-data','btn-plot-storage'].forEach(id=>{
          document.getElementById(id).disabled = !enable;
        });
      }


      async function initPy(){
        if (pyReady || pyLoading) return;
        pyLoading = true;
        try{
          setStatus('Loading Python…');
          pyodide = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/' });
          setProgress('Loading packages (pandas, numpy)…');
          await pyodide.loadPackage(['pandas','numpy']);
          setProgress('Loading modules & data…');
          pyodide.FS.mkdirTree('/app'); pyodide.FS.mkdirTree('/data'); pyodide.FS.mkdirTree('/tmp');
          const rt = async p => { const r = await fetch(p + '?v=' + Date.now()); if(!r.ok) throw new Error('load '+p); return await r.text(); };
          pyodide.FS.writeFile('/app/WPsCT_Main.py',          await rt('runtime/WPsCT_Main.py'));
          pyodide.FS.writeFile('/app/WPsCT_Functions.py',     await rt('runtime/WPsCT_Functions.py'));
          pyodide.FS.writeFile('/app/WPsCT_Sensitivity.py',   await rt('runtime/WPsCT_Sensitivity.py'));
          pyodide.FS.writeFile('/data/Example_ME.csv',        await rt('runtime/Example_ME.csv'));
          pyodide.FS.writeFile('/data/Example_US.csv',        await rt('runtime/Example_US.csv'));
          pyodide.FS.writeFile('/data/WPs_Tracker_paras.csv', await rt('runtime/WPs_Tracker_paras.csv'));
          pyodide.runPython("import sys, os; os.makedirs('/app',exist_ok=True); sys.path.append('/app') if '/app' not in sys.path else None");
          pyReady = true;
          enableRunButtons(true);
          setProgress('');
          setStatus('Tracker ready.');
        }catch(err){ console.error(err); setStatus('Loading failed. See console.'); }
        finally { pyLoading = false; }
      }

      function getInputUnit(){ return document.getElementById('u-lbs').checked?'lbs':document.getElementById('u-kg').checked?'kg':document.getElementById('u-mt').checked?'mt':document.getElementById('u-tgc').checked?'tgc':'kg'; }
      function getPlotUnit(){ return document.getElementById('p-kg').checked?'kg':'tgc'; }
      function toKg(arr,inUnit){ const f=(inUnit==='lbs')?0.45359237:(inUnit==='kg')?1:(inUnit==='mt')?1e9:1e9; return arr.map(v=>(v==null?0:Number(v))*f); }
      function fromKg(arrKg,p){ return (p==='kg')?arrKg:arrKg.map(v=>v/1e9); }
      function unitLabel(p,isC=false){ return (p==='kg')?(isC?'kg C':'kg'):'Tg C (MMTC)'; }

      async function getUploadedFileBytes(inputId){
        const inp = document.getElementById(inputId);
        if (!inp||!inp.files||inp.files.length===0) return [null,null];
        const file=inp.files[0]; const buf=await file.arrayBuffer();
        return [file.name, new Uint8Array(buf)];
      }

      function dataChoice(){ return document.getElementById('rb-me').checked?'example_me':document.getElementById('rb-us').checked?'example_us':'upload'; }
      function paraChoice(){ return document.getElementById('rb-default-para').checked?'default':'upload'; }

      async function resolveDataPath(){
        const ch=dataChoice();
        if(ch==='example_me') return '/data/Example_ME.csv';
        if(ch==='example_us') return '/data/Example_US.csv';
        const [name,bytes]=await getUploadedFileBytes('file-data');
        if(!name) throw new Error('Please choose a data file to upload.');
        const p='/tmp/'+name; pyodide.FS.writeFile(p,bytes); return p;
      }
      async function resolveParaPath(){
        const ch=paraChoice();
        if(ch==='default') return '/data/WPs_Tracker_paras.csv';
        const [name,bytes]=await getUploadedFileBytes('file-paras');
        if(!name) throw new Error('Please choose a parameter file to upload.');
        const p='/tmp/'+name; pyodide.FS.writeFile(p,bytes); return p;
      }

      async function runTracker(){
        if(!pyReady){ await initPy(); if(!pyReady) return; }
        try{
          setStatus('Running tracker…');
          const dataPath=await resolveDataPath();
          const parasPath=await resolveParaPath();
          const outCsv='/tmp/WPsCT_Results.csv';
          pyodide.globals.set('data_path',dataPath);
          pyodide.globals.set('paras_path',parasPath);
          pyodide.globals.set('out_csv',outCsv);
          await pyodide.runPythonAsync(`
import importlib, pandas as pd
WPsCT_Main = importlib.import_module('WPsCT_Main')
WPsCT_Main.tracker(data_path, paras_path, out_csv)
df = pd.read_csv(out_csv)
html_preview = df.head(40).to_html(index=False)
          `);
          document.getElementById('results-preview').innerHTML = pyodide.globals.get('html_preview');
          const bytes=pyodide.FS.readFile('/tmp/WPsCT_Results.csv');
          const blob=new Blob([bytes],{type:'text/csv'});
          document.getElementById('download-link').href=URL.createObjectURL(blob);
          document.getElementById('download-link').classList.remove('hidden');
          setStatus('Done.');
        }catch(err){ console.error(err); setStatus('Run failed. See console.'); }
      }

      function plotlySize(div){ const el=document.getElementById(div); return {w:el.clientWidth||820,h:el.clientHeight||380}; }

      const HWP_COLORS = {
        'Biofuel':        '#f97316',
        'Biochar':        '#78350f',
        'Construction':   '#1d4ed8',
        'Exterior':       '#0891b2',
        'Household':      '#7c3aed',
        'Graphic Paper':  '#059669',
        'Household Paper':'#65a30d',
        'Other Paper':    '#16a34a',
        'GraphicPaper':   '#059669',
        'OtherPaper':     '#16a34a',
        'HouseholdPaper': '#65a30d',
        'Landfill':       '#9ca3af',
      };

      function eupBaseLayout(extraLayout){
        return Object.assign({
          autosize: true,
          margin: {l:65, r:25, t:35, b:90},
          paper_bgcolor: '#f9fafb',
          plot_bgcolor:  '#ffffff',
          font: {family: 'Inter, system-ui, sans-serif', size: 12, color: '#374151'},
          legend: {
            orientation: 'h',
            y: -0.28,
            x: 0,
            font: {size: 11},
            bgcolor: 'rgba(0,0,0,0)',
          },
          xaxis: {
            title: {text: 'Year', standoff: 12, font:{size:12}},
            showgrid: true, gridcolor: '#f3f4f6', gridwidth: 1,
            zeroline: false,
            linecolor: '#e5e7eb', linewidth: 1,
            tickfont: {size: 11},
          },
          hovermode: 'x unified',
          hoverlabel: {bgcolor:'#1e293b', font:{color:'#f8fafc', size:11}, bordercolor:'#334155'},
        }, extraLayout||{});
      }

      function displayPlot(divId, traces, extraLayout){
        Plotly.newPlot(divId, traces, eupBaseLayout(extraLayout),
          {responsive:true, displayModeBar:true,
           modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'],
           displaylogo:false, toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_enduse'}});
      }

      async function plotData(){
        if(!pyReady){ await initPy(); if(!pyReady) return; }
        try{
          setStatus('Loading input data…');
          const inUnit=getInputUnit(); const pUnit=getPlotUnit();
          const dataPath=await resolveDataPath();
          pyodide.globals.set('data_path',dataPath);
          const jsonStr=await pyodide.runPythonAsync(`
import pandas as pd, json, numpy as np
df = pd.read_csv(data_path)
df['Year'] = pd.to_numeric(df['Year'], errors='coerce')
df = df[df['Year'].notna()].copy()
cols = ['Biofuel','Biochar','Construction','Exterior','Household','Graphic Paper','Household Paper','Other Paper']
out = { 'Year': df['Year'].astype(float).tolist() }
for c in cols:
    if c in df.columns:
        y = pd.to_numeric(df[c], errors='coerce').fillna(0.0)
        out[c] = y.astype(float).tolist()
json.dumps(out, allow_nan=False)
          `);
          const o=JSON.parse(jsonStr);
          const years=o["Year"]||[];
          const seriesOrder=['Construction','Exterior','Household','Graphic Paper','Household Paper','Other Paper','Biochar','Biofuel'];
          const traces=[];
          for(const name of seriesOrder){
            if(o[name]){
              const ykg=toKg(o[name],inUnit); const y=fromKg(ykg,pUnit);
              traces.push({
                x:years, y, mode:'lines', name,
                line:{color:HWP_COLORS[name]||'#6b7280', width:2},
                hovertemplate:'%{y:.3f}<extra>'+name+'</extra>',
              });
            }
          }
          displayPlot('plot-data-area', traces, {
            yaxis:{title:{text:'Annual production ('+unitLabel(pUnit,false)+')', standoff:12, font:{size:12}},
                   showgrid:true, gridcolor:'#f3f4f6', zeroline:false, tickfont:{size:11}, separatethousands:true},
          });
          setStatus('Input data plotted successfully.');
        }catch(err){ console.error(err); setStatus('Plot failed - see console for details.'); }
      }

      async function plotStorage(){
        if(!pyReady){ await initPy(); if(!pyReady) return; }
        try{
          setStatus('Running model and preparing storage plot…');
          const pUnit=getPlotUnit();
          const outCsv='/tmp/WPsCT_Results.csv';
          try{ pyodide.FS.stat(outCsv); }catch(e){ await runTracker(); }
          pyodide.globals.set('out_csv',outCsv);
          const jsonStr=await pyodide.runPythonAsync(`
import pandas as pd, json, numpy as np
df = pd.read_csv(out_csv)
df['Year'] = pd.to_numeric(df['Year'], errors='coerce')
df = df[df['Year'].notna()].copy()
cols_map = [
  ('Construction_InUse','Construction'),('Exterior_InUse','Exterior'),
  ('Household_InUse','Household'),('GraphicPaper_InUse','GraphicPaper'),
  ('HouseholdPaper_InUse','HouseholdPaper'),('OtherPaper_InUse','OtherPaper'),
  ('Biochar_Stock','Biochar'),('LF_Stock_Total','Landfill'),
]
out = { 'Year': df['Year'].astype(float).tolist(), 'series': {}, 'last': {} }
for col, short in cols_map:
    if col in df.columns:
        y = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
        out['series'][short] = y.astype(float).tolist()
        out['last'][short] = float(y.iloc[-1])
json.dumps(out, allow_nan=False)
          `);
          const o=JSON.parse(jsonStr);
          const years=o["Year"]||[];
          const s=o["series"]||{};
          const last=o["last"]||{};
          const order=['Construction','Exterior','Household','GraphicPaper','HouseholdPaper','OtherPaper','Biochar','Landfill'];
          const displayNames={'GraphicPaper':'Graphic Paper','OtherPaper':'Other Paper','HouseholdPaper':'Household Paper'};
          const traces=[];
          for(const name of order){
            if(s[name]){
              const y=fromKg(s[name],pUnit);
              const label=displayNames[name]||name;
              traces.push({
                x:years, y,
                mode:'lines', name:label,
                fill: name==='Landfill' ? 'tozeroy' : 'none',
                fillcolor: name==='Landfill' ? 'rgba(156,163,175,0.15)' : undefined,
                line:{color:HWP_COLORS[name]||'#6b7280', width: name==='Landfill'?1.5:2,
                      dash: name==='Landfill'?'dot':'solid'},
                hovertemplate:'%{y:.4f}<extra>'+label+'</extra>',
              });
            }
          }
          displayPlot('plot-storage-area', traces, {
            yaxis:{title:{text:'Carbon stock ('+unitLabel(pUnit,true)+')', standoff:12, font:{size:12}},
                   showgrid:true, gridcolor:'#f3f4f6', zeroline:false, tickfont:{size:11}, separatethousands:true},
          });
          const panel=document.getElementById('eup-summary-panel');
          const badges=document.getElementById('eup-summary-badges');
          if(panel && badges){
            const inUsePools=['Construction','Exterior','Household','GraphicPaper','HouseholdPaper','OtherPaper'];
            const totalInUse=fromKg([inUsePools.reduce((a,k)=>a+(last[k]||0),0)],pUnit)[0];
            const lf=fromKg([last['Landfill']||0],pUnit)[0];
            const bc=fromKg([last['Biochar']||0],pUnit)[0];
            const total=fromKg([Object.values(last).reduce((a,v)=>a+v,0)],pUnit)[0];
            const ul=unitLabel(pUnit,true);
            const yr=years[years.length-1]||'';
            badges.innerHTML=[
              ['Total Stock', total.toFixed(3)+' '+ul, '#4f46e5','#eef2ff'],
              ['In-use Products', totalInUse.toFixed(3)+' '+ul, '#059669','#ecfdf5'],
              ['Landfill Pool', lf.toFixed(3)+' '+ul, '#6b7280','#f9fafb'],
              ['Biochar Pool', bc.toFixed(3)+' '+ul, '#78350f','#fef3c7'],
            ].map(([label,val,color,bg])=>
              `<div class="rounded-xl p-3 text-center" style="background:${bg}">
                <p class="text-xs font-semibold uppercase tracking-wide mb-1" style="color:${color}">${label}</p>
                <p class="text-lg font-bold" style="color:${color}">${val}</p>
                <p class="text-xs text-gray-400">Year ${yr}</p>
              </div>`
            ).join('');
            panel.classList.remove('hidden');
          }
          setStatus('Carbon storage plotted successfully.');
        }catch(err){ console.error(err); setStatus('Plot failed - see console for details.'); }
      }

      function clearAll(){
        document.getElementById('results-preview').innerHTML='';
        document.getElementById('download-link').classList.add('hidden');
        const panel=document.getElementById('eup-summary-panel');
        if(panel) panel.classList.add('hidden');
        Plotly.purge('plot-data-area'); Plotly.purge('plot-storage-area');
        setStatus('Cleared.');
      }

      document.getElementById('btn-run').addEventListener('click', runTracker);
      document.getElementById('btn-plot-data').addEventListener('click', plotData);
      document.getElementById('btn-plot-storage').addEventListener('click', plotStorage);
      document.getElementById('btn-clear').addEventListener('click', clearAll);

      /* 1. Industrial Logs tab */
      const WOOD_PROPS = {
        softwood: { density: 450, carbonFraction: 0.50 },
        hardwood: { density: 600, carbonFraction: 0.48 }
      };

      const EFFICIENCY_DEFAULTS = {
        'Construction':    0.70,
        'Household':       0.65,
        'Exterior':        0.85,
        'Graphic Paper':   0.85,
        'Household Paper': 0.90,
        'Other Paper':     0.95,
      };

      /* Reset Industrial Logs defaults */
      window.resetEfficiency = function() {
        const prod = selectedIndustrialProduct;
        const val  = prod && EFFICIENCY_DEFAULTS[prod] ? EFFICIENCY_DEFAULTS[prod] : 0.70;
        document.getElementById('il-efficiency').value = val;
        onIlInputChange();
      }

      window.resetPhysicalParams = function() {
        const wt = document.getElementById('il-woodtype').value;
        const props = WOOD_PROPS[wt];
        document.getElementById('il-density').value      = props.density;
        document.getElementById('il-carbon-frac').value  = props.carbonFraction;
        onIlInputChange();
      }

      window.syncPhysicalDefaults = function syncPhysicalDefaults() {
        const wt = document.getElementById('il-woodtype').value;
        const props = WOOD_PROPS[wt];
        const curDensity = parseFloat(document.getElementById('il-density').value);
        const curFrac    = parseFloat(document.getElementById('il-carbon-frac').value);
        const otherProps = WOOD_PROPS[wt === 'softwood' ? 'hardwood' : 'softwood'];
        if (curDensity === otherProps.density)     document.getElementById('il-density').value     = props.density;
        if (curFrac    === otherProps.carbonFraction) document.getElementById('il-carbon-frac').value = props.carbonFraction;
      }

      let selectedVolumeMethod = 'cylinder';

      const VOL_METHOD_META = {
        cylinder: {
          desc: 'V = π × r² × L - single diameter, overestimates tapered logs.',
          inputs: 'vol-inputs-cylinder'
        },
        huber: {
          desc: 'V = π × r_mid² × L - mid-point diameter only, most commonly used in practice.',
          inputs: 'vol-inputs-huber'
        },
        smalian: {
          desc: 'V = π/2 × (r_butt² + r_tip²) × L - uses both end diameters.',
          inputs: 'vol-inputs-smalian'
        },
        newton: {
          desc: 'V = π/6 × (r_butt² + 4×r_mid² + r_tip²) × L - most accurate, needs 3 measurements.',
          inputs: 'vol-inputs-newton'
        }
      };

      /* Volume method selection for Industrial Logs */
      window.setVolMethod = function(method) {
        selectedVolumeMethod = method;
        document.querySelectorAll('.vol-method-btn').forEach(btn => {
          const isSelected = btn.dataset.method === method;
          btn.classList.toggle('selected', isSelected);
          btn.classList.toggle('border-green-600', isSelected);
          btn.classList.toggle('bg-green-50', isSelected);
          btn.classList.toggle('text-green-800', isSelected);
          btn.classList.toggle('border-gray-200', !isSelected);
          btn.classList.toggle('bg-gray-50', !isSelected);
          btn.classList.toggle('text-gray-600', !isSelected);
        });
        ['cylinder','huber','smalian','newton'].forEach(m => {
          document.getElementById('vol-inputs-' + m).classList.toggle('hidden', m !== method);
        });
        document.getElementById('vol-method-desc').textContent = VOL_METHOD_META[method].desc;
        onIlInputChange();
      }

      function calcVolume() {
        const pi = Math.PI;
        const toR = d => (parseFloat(d) / 2) / 100; // cm diameter → m radius
        const L = m => parseFloat(document.getElementById('il-length' + m).value) || 0;

        if (selectedVolumeMethod === 'cylinder') {
          const r = toR(document.getElementById('il-diameter').value || 0);
          const l = L('');
          if (!r || !l) return null;
          return { vol: pi * r * r * l, L: l, method: 'Cylinder' };

        } else if (selectedVolumeMethod === 'huber') {
          const r = toR(document.getElementById('il-d-mid').value || 0);
          const l = L('-h');
          if (!r || !l) return null;
          return { vol: pi * r * r * l, L: l, method: 'Huber' };

        } else if (selectedVolumeMethod === 'smalian') {
          const rb = toR(document.getElementById('il-d-butt').value || 0);
          const rt = toR(document.getElementById('il-d-tip').value  || 0);
          const l  = L('-s');
          if (!rb || !l) return null;
          return { vol: (pi / 2) * (rb * rb + rt * rt) * l, L: l, method: 'Smalian' };

        } else if (selectedVolumeMethod === 'newton') {
          const rb = toR(document.getElementById('il-d-butt-n').value || 0);
          const rm = toR(document.getElementById('il-d-mid-n').value  || 0);
          const rt = toR(document.getElementById('il-d-tip-n').value  || 0);
          const l  = L('-n');
          if (!rb || !rm || !l) return null;
          return { vol: (pi / 6) * (rb * rb + 4 * rm * rm + rt * rt) * l, L: l, method: 'Newton' };
        }
        return null;
      }

      function suggestProduct(diamCm, woodType) {
        if (woodType === 'softwood') {
          if (diamCm >= 25) return 'Construction';
          if (diamCm >= 15) return 'Exterior';
          return 'Household';
        } else { // hardwood
          if (diamCm >= 30) return 'Construction';
          if (diamCm >= 18) return 'Household';
          if (diamCm >= 10) return 'Exterior';
          return 'Graphic Paper';
        }
      }

      let selectedIndustrialProduct = null;

      window.onIlInputChange = function onIlInputChange() {
        const wt      = document.getElementById('il-woodtype').value;
        const density = parseFloat(document.getElementById('il-density').value)     || WOOD_PROPS[wt].density;
        const cfrac   = parseFloat(document.getElementById('il-carbon-frac').value) || WOOD_PROPS[wt].carbonFraction;

        const result = calcVolume();
        if (result && result.vol > 0) {
          const { vol, method } = result;
          const mass     = vol * density;
          const carbonKg = mass * cfrac;

          const eff = parseFloat(document.getElementById('il-efficiency')?.value) || 0.70;
          const carbonProduct = carbonKg * eff;
          document.getElementById('il-carbon-estimate').classList.remove('hidden');
          document.getElementById('il-carbon-display').innerHTML =
            `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">` +
              statTile('Volume', vol.toFixed(3) + ' m³') +
              statTile('Mass', mass.toFixed(1) + ' kg') +
              statTile('Log carbon', carbonKg.toFixed(2) + ' kg C') +
              statTile('Product carbon', carbonProduct.toFixed(2) + ' kg C') +
            `</div>` +
            `<p class="text-xs text-gray-500 mt-3">${method} method &middot; density ${density} kg/m³ ` +
            `&middot; carbon fraction ${cfrac.toFixed(2)} &middot; conversion efficiency ${(eff*100).toFixed(0)}%</p>`;

          let primaryDiam = 0;
          if (selectedVolumeMethod === 'cylinder')  primaryDiam = parseFloat(document.getElementById('il-diameter').value) || 0;
          else if (selectedVolumeMethod === 'huber') primaryDiam = parseFloat(document.getElementById('il-d-mid').value) || 0;
          else if (selectedVolumeMethod === 'smalian') primaryDiam = parseFloat(document.getElementById('il-d-butt').value) || 0;
          else if (selectedVolumeMethod === 'newton')  primaryDiam = parseFloat(document.getElementById('il-d-butt-n').value) || 0;

          if (primaryDiam > 0) {
            const sug = suggestProduct(primaryDiam, wt);
            document.querySelectorAll('.product-card').forEach(card => {
              card.classList.remove('suggested');
              if (card.dataset.product === sug) card.classList.add('suggested');
            });
            document.getElementById('il-suggestion-note').textContent = `💡 Suggested: ${sug} (based on log size & type)`;
            document.getElementById('il-suggestion-note').classList.remove('hidden');
            if (!selectedIndustrialProduct) selectProduct(sug);
          }
        }
      }

      window.selectProduct = function selectProduct(name) {
        selectedIndustrialProduct = name;
        renderParamBox('il-param-box', name, 'ilp');
        document.querySelectorAll('.product-card').forEach(card => {
          card.classList.toggle('selected', card.dataset.product === name);
        });
        const effField = document.getElementById('il-efficiency');
        if (effField && EFFICIENCY_DEFAULTS[name]) {
          const cur = parseFloat(effField.value);
          const isADefault = Object.values(EFFICIENCY_DEFAULTS).some(v => Math.abs(v - cur) < 0.001);
          if (isADefault) effField.value = EFFICIENCY_DEFAULTS[name];
        }
        onIlInputChange();
      }

      function setIlStatus(msg) { document.getElementById('il-status').textContent = msg; }

      /* ---- Editable end-use parameters shown in Section 4 (Industrial Logs & Primary Products) ----
         Defaults below mirror runtime/WPs_Tracker_paras.csv. On each run a full
         parameter CSV is regenerated with any Section-4 edits applied, so the
         user can override defaults without leaving the tab. */
      const WP_PARAM_DEFAULTS = {
        'Biofuel': {efficiency:1},
        'Biochar': {decay_1:0.007, decay_2:0.0003},
        'Construction':   {disposal_1:0.133, disposal_2:0.028, disposal_3:80, recycle_1:0.085, recycle_2:0.015},
        'Exterior':       {disposal_1:0.326, disposal_2:0.041, disposal_3:25},
        'Household':      {disposal_1:0.265, disposal_2:0.031, disposal_3:30, recycle_1:0.085, recycle_2:0.015},
        'Graphic Paper':  {disposal_1:1.006, disposal_2:0, disposal_3:6, recycle_1:0.225, recycle_2:0.027},
        'Other Paper':    {disposal_1:6.036, disposal_2:0, disposal_3:1, recycle_1:0.225, recycle_2:0.027},
        'Household Paper':{disposal_1:12.036, disposal_2:0, disposal_3:0.5},
        'Landfill': {con_decay1:0.997, con_decay2:30, ext_decay1:1.178, ext_decay2:20,
                     hou_decay1:1.329, hou_decay2:15, pap_decay1:0.821, pap_decay2:5}
      };
      const WP_PARAM_LABELS = {
        disposal_1:'Disposal rate - peak height',
        disposal_2:'Disposal rate - spread',
        disposal_3:'Service half-life (years)',
        recycle_1:'Recycling rate - initial',
        recycle_2:'Recycling rate - growth / yr'
      };
      const WP_PARAM_ORDER = ['disposal_1','disposal_2','disposal_3','recycle_1','recycle_2'];

      // Render the editable parameter fields for `product` into the given box.
      function renderParamBox(boxId, product, prefix){
        const box = document.getElementById(boxId);
        if(!box) return;
        const defs = WP_PARAM_DEFAULTS[product];
        if(!defs){ box.innerHTML = ''; return; }
        let html = '<p class="param-title">⚙ Parameters for ' + product + '</p>';
        WP_PARAM_ORDER.forEach(function(v){
          if(defs[v] === undefined) return;
          html += '<div class="param-row"><label class="param-label">' + WP_PARAM_LABELS[v] + '</label>' +
                  '<input type="number" step="any" class="param-input" id="' + prefix + '-' + v +
                  '" value="' + defs[v] + '"></div>';
        });
        html += '<button type="button" class="param-reset" onclick="resetParamBox(\'' + boxId +
                '\',\'' + product + '\',\'' + prefix + '\')">↺ Reset parameters</button>';
        box.innerHTML = html;
      }
      window.resetParamBox = function(boxId, product, prefix){ renderParamBox(boxId, product, prefix); };

      // Rebuild the full parameter CSV from defaults, applying Section-4 edits for `product`.
      function buildParaCSV(prefix, product){
        const out = [['Product','Variable','Parameter']];
        for(const p in WP_PARAM_DEFAULTS){
          const vars = WP_PARAM_DEFAULTS[p];
          for(const v in vars){
            let val = vars[v];
            if(p === product){
              const f = document.getElementById(prefix + '-' + v);
              if(f && f.value !== '' && !isNaN(parseFloat(f.value))) val = parseFloat(f.value);
            }
            out.push([p, v, val]);
          }
        }
        return out.map(function(r){ return r.join(','); }).join('\n') + '\n';
      }


      window.runIlTracker = async function runIlTracker() {
        if (!pyReady) {
          setIlStatus('⏳ Loading… (first run downloads Python, ~30-60 s)');
          await initPy();
          if (!pyReady) {
            setIlStatus('❌ Loading failed. Please check your internet connection and try again.');
            return;
          }
        }
        if (!selectedIndustrialProduct) { setIlStatus('Please select a product type first.'); return; }

        const wt      = document.getElementById('il-woodtype').value;
        const nYears  = parseInt(document.getElementById('il-years').value) || 100;
        const density = parseFloat(document.getElementById('il-density').value)     || WOOD_PROPS[wt].density;
        const cfrac   = parseFloat(document.getElementById('il-carbon-frac').value) || WOOD_PROPS[wt].carbonFraction;

        const volResult = calcVolume();
        if (!volResult || volResult.vol <= 0) { setIlStatus('Please enter valid log dimensions.'); return; }

        const vol         = volResult.vol;
        const mass        = vol * density;
        const carbonKgLog = mass * cfrac;          // total carbon in the log
        const efficiency  = parseFloat(document.getElementById('il-efficiency').value) || 0.70;
        const carbonKg    = carbonKgLog * efficiency;  // carbon entering the product
        const L           = volResult.L;

        setIlStatus('Running log carbon tracker…');

        try {
          pyodide.globals.set('log_carbon_kg',    carbonKg);
          pyodide.globals.set('log_product_name', selectedIndustrialProduct);
          pyodide.globals.set('log_n_years',      nYears);
          pyodide.FS.writeFile('/data/_il_paras.csv', buildParaCSV('ilp', selectedIndustrialProduct));
          pyodide.globals.set('log_para_path', '/data/_il_paras.csv');

          const jsonStr = await pyodide.runPythonAsync(`
import pandas as pd, json, math, sys
sys.path.append('/app')
import WPsCT_Functions as wf

para = pd.read_csv(log_para_path)
prod = log_product_name
n    = int(log_n_years)
C0   = float(log_carbon_kg)   # carbon entering the product (after efficiency)

def get_para(product, variable):
    rows = para.loc[(para['Product'] == product) & (para['Variable'] == variable), 'Parameter']
    return float(rows.values[0]) if len(rows) > 0 else 0.0

# ── Step 1: In-use pool via disposal_CF ───────────────────────────────────────
production = [C0] + [0.0] * (n - 1)
dp1 = get_para(prod, 'disposal_1')
dp2 = get_para(prod, 'disposal_2')
dp3 = get_para(prod, 'disposal_3')

inuse_raw, _ = wf.disposal_CF(n, production, dp1, dp2, dp3)
inuse_arr = [max(0.0, float(v)) for v in inuse_raw]

# ── Step 2: Landfill inflow = actual decrease in in-use each year ─────────────
# This correctly captures only what truly leaves in-use; once in-use=0, inflow=0
landfill_in_raw = []
for i in range(n):
    prev_inuse = inuse_arr[i-1] if i > 0 else C0
    flow = max(0.0, prev_inuse - inuse_arr[i])
    landfill_in_raw.append(flow)

# ── Step 3: Recycling reduces landfill input ──────────────────────────────────
rp1_rows = para.loc[(para['Product'] == prod) & (para['Variable'] == 'recycle_1'), 'Parameter']
if len(rp1_rows) > 0:
    rp1 = float(rp1_rows.values[0])
    rp2 = get_para(prod, 'recycle_2')
    rr_series = [min(1.0, max(0.0, rp1 + rp2 * math.log(max(i+1.0, 1e-12)))) for i in range(n)]
    landfill_in = [landfill_in_raw[i] * (1.0 - rr_series[i]) for i in range(n)]
else:
    landfill_in = landfill_in_raw[:]

# ── Step 4: Landfill pool - cohort survival with exponential decay ────────────
# Each cohort entering landfill at year j decays with half-life k2.
# At year i, cohort j has survived for (i-j) years: amount = inflow[j] * exp(-ln2/k2*(i-j))
# This guarantees: when inflow stops, pool decays cleanly to zero.
lf_map = {
    'Construction':    ('con_decay1','con_decay2'),
    'Exterior':        ('ext_decay1','ext_decay2'),
    'Household':       ('hou_decay1','hou_decay2'),
    'Graphic Paper':   ('pap_decay1','pap_decay2'),
    'Other Paper':     ('pap_decay1','pap_decay2'),
    'Household Paper': ('pap_decay1','pap_decay2'),
}
lf_keys = lf_map.get(prod, ('con_decay1','con_decay2'))
k2 = get_para('Landfill', lf_keys[1])
decay_rate = math.log(2.0) / max(k2, 0.01)

lf_pool_arr = []
for i in range(n):
    pool = sum(landfill_in[j] * math.exp(-decay_rate * (i - j)) for j in range(i + 1))
    lf_pool_arr.append(max(0.0, pool))

# ── Step 5: Derived series ────────────────────────────────────────────────────
years_arr      = list(range(1, n + 1))
total_retained = [max(0.0, inuse_arr[i] + lf_pool_arr[i]) for i in range(n)]
cumul_released = [max(0.0, min(C0, C0 - total_retained[i])) for i in range(n)]

out = {
    'years':          years_arr,
    'inuse':          inuse_arr,
    'lf_pool':        lf_pool_arr,
    'total_retained': total_retained,
    'cumul_released': cumul_released,
    'C0':             C0,
    'product':        prod,
    'n_years':        n,
    'lf_halflife':    k2,
}
json.dumps(out, allow_nan=False)
          `);

          const res = JSON.parse(jsonStr);
          renderIlResults(res, carbonKgLog, carbonKg, efficiency, vol, volResult.method, wt, nYears);
          setIlStatus(`Done - tracked ${nYears} years for ${selectedIndustrialProduct} wood product.`);

        } catch(err) {
          console.error(err);
          setIlStatus('Run failed. See browser console for details.');
        }
      }

      function renderIlResults(res, carbonKgLog, carbonKg, efficiency, vol, volMethod, woodType, nYears) {
        const years = res.years;

        const finalRetained  = res.total_retained[res.total_retained.length - 1];
        const finalReleased  = res.cumul_released[res.cumul_released.length - 1];
        const retainedPct    = (finalRetained / carbonKg * 100).toFixed(1);
        const releasedPct    = (finalReleased / carbonKg * 100).toFixed(1);
        const peakInUseYr    = res.inuse.indexOf(Math.max(...res.inuse)) + 1;

        const effPct = (efficiency * 100).toFixed(0);
        const badgesHtml = `
          <div class="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span class="text-lg font-bold text-gray-700">${carbonKgLog.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Log carbon</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-green-50 rounded-xl border border-green-200">
            <span class="text-lg font-bold text-green-700">${carbonKg.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Product carbon<br>(${effPct}% efficiency)</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-blue-50 rounded-xl border border-blue-200">
            <span class="text-lg font-bold text-blue-700">${finalRetained.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Retained at year ${nYears}<br>(${retainedPct}% of product C)</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-red-50 rounded-xl border border-red-200">
            <span class="text-lg font-bold text-red-600">${finalReleased.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Released at year ${nYears}<br>(${releasedPct}% of product C)</span>
          </div>
        `;
        document.getElementById('il-summary-badges').innerHTML = badgesHtml;
        document.getElementById('il-summary-panel').classList.remove('hidden');

        const traces = [
          {
            x: years, y: res.total_retained,
            mode: 'lines', name: 'Total Retained (In-use + Landfill)',
            line: { color: '#16a34a', width: 2.5 },
            fill: 'tozeroy', fillcolor: 'rgba(22,163,74,0.08)'
          },
          {
            x: years, y: res.inuse,
            mode: 'lines', name: 'In-use Pool',
            line: { color: '#2563eb', width: 2, dash: 'dot' }
          },
          {
            x: years, y: res.lf_pool,
            mode: 'lines', name: 'Landfill Pool',
            line: { color: '#9333ea', width: 2, dash: 'dash' }
          },
          {
            x: years, y: res.cumul_released,
            mode: 'lines', name: 'Cumulative Released to Atmosphere',
            line: { color: '#dc2626', width: 2 },
            fill: 'tozeroy', fillcolor: 'rgba(220,38,38,0.06)'
          }
        ];

        const layout = {
          autosize: true,
          width:  document.getElementById('il-plot-area').clientWidth || 800,
          height: document.getElementById('il-plot-area').clientHeight || 450,
          margin: { l:65, r:20, t:50, b:80 },
          legend: { orientation:'h', y:-0.28 },
          xaxis:  { title: { text: 'Years after harvest', standoff: 20 } },
          yaxis:  { title: { text: 'Carbon (kg C)', standoff: 12 } },
          title:  {
            text: `Log Carbon Tracking - ${selectedIndustrialProduct} (${woodType}, ${vol.toFixed(3)} m³ ${volMethod}, eff. ${(efficiency*100).toFixed(0)}%)`,
            font: { size: 13 }
          },
          hovermode: 'x unified'
        };

        Plotly.newPlot('il-plot-area', traces, layout, { responsive: true, displayModeBar: true, displaylogo:false, modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'], toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_log'} });

        let html = '<table style="border-collapse:collapse;width:100%;font-size:0.78rem">';
        html += '<thead><tr style="background:#f1f5f9">';
        ['Year','In-use (kg C)','Landfill Pool (kg C)','Total Retained (kg C)','Cumul. Released (kg C)'].forEach(h=>{
          html += `<th style="border:1px solid #e2e8f0;padding:3px 7px;text-align:right">${h}</th>`;
        });
        html += '</tr></thead><tbody>';

        for (let i = 0; i < years.length; i++) {
          if (i >= 20 && (i+1) % 5 !== 0) continue;
          const bg = i % 2 === 0 ? '#fff' : '#f8fafc';
          html += `<tr style="background:${bg}">`;
          [years[i],
           res.inuse[i].toFixed(3),
           res.lf_pool[i].toFixed(3),
           res.total_retained[i].toFixed(3),
           res.cumul_released[i].toFixed(3)
          ].forEach(v => {
            html += `<td style="border:1px solid #e2e8f0;padding:3px 7px;text-align:right">${v}</td>`;
          });
          html += '</tr>';
        }
        html += '</tbody></table>';
        document.getElementById('il-results-preview').innerHTML = html;

        let csv = `Year,InUse_kgC,LandfillPool_kgC,TotalRetained_kgC,CumulReleased_kgC\n# LogCarbon=${carbonKgLog.toFixed(4)} ProductCarbon=${carbonKg.toFixed(4)} Efficiency=${efficiency} Method=${volMethod} Volume=${vol.toFixed(4)}m3 Product=${selectedIndustrialProduct}\n`;
        for (let i = 0; i < years.length; i++) {
          csv += `${years[i]},${res.inuse[i].toFixed(4)},${res.lf_pool[i].toFixed(4)},${res.total_retained[i].toFixed(4)},${res.cumul_released[i].toFixed(4)}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.getElementById('il-download-link');
        link.href = URL.createObjectURL(blob);
        link.classList.remove('hidden');
      }

      window.clearIlTracker = function clearIlTracker() {
        selectedIndustrialProduct = null;
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('il-summary-panel').classList.add('hidden');
        document.getElementById('il-results-preview').innerHTML = '';
        document.getElementById('il-download-link').classList.add('hidden');
        document.getElementById('il-carbon-estimate').classList.add('hidden');
        document.getElementById('il-suggestion-note').classList.add('hidden');
        Plotly.purge('il-plot-area');
        setIlStatus('Cleared. Select product type and run again.');
      }

      onIlInputChange();

      /* 2. Primary Products tab */
      const SP_WOOD_PROPS = {
        softwood: { density: 420, carbonFraction: 0.50 },
        hardwood: { density: 580, carbonFraction: 0.49 },
        tropical: { density: 680, carbonFraction: 0.48 },
      };

      const SP_EFFICIENCY_DEFAULTS = {
        'Construction': 0.90, 'Exterior': 0.88, 'Household': 0.85,
        'Graphic Paper': 0.80, 'Household Paper': 0.80, 'Other Paper': 0.82,
      };

      const SP_TYPE_DESCRIPTIONS = {
        lumber:      'Dimensional lumber (2×4, 2×6, glulam beams, etc.): enter thickness, width, length.',
        panel:       'Sheet goods (plywood, OSB, MDF, particleboard): enter thickness, width, length.',
        engineered:  'Structural composite lumber (CLT, LVL, glulam, I-joist): enter cross-section and length.',
        other:       'Any other solid wood product: enter total serviceable volume directly.',
      };

      let selectedSawnType = 'lumber';
      let selectedSawnProduct = null;

      /* Primary product input type selector */
      window.setSpType = function(type) {
        selectedSawnType = type;
        document.querySelectorAll('.sp-type-btn').forEach(btn => {
          const isSelected = btn.dataset.ptype === type;
          btn.classList.toggle('selected', isSelected);
          btn.classList.toggle('border-teal-600', isSelected);
          btn.classList.toggle('bg-teal-50', isSelected);
          btn.classList.toggle('text-teal-800', isSelected);
          btn.classList.toggle('border-gray-200', !isSelected);
          btn.classList.toggle('bg-gray-50', !isSelected);
          btn.classList.toggle('text-gray-600', !isSelected);
        });
        ['lumber','panel','engineered','other'].forEach(t => {
          document.getElementById('sp-inputs-' + t).classList.toggle('hidden', t !== type);
        });
        document.getElementById('sp-type-desc').textContent = SP_TYPE_DESCRIPTIONS[type];
        onSpChange();
      };

      window.syncSpDefaults = function() {
        const wt = document.getElementById('sp-woodtype').value;
        const props = SP_WOOD_PROPS[wt];
        document.getElementById('sp-density').value     = props.density;
        document.getElementById('sp-carbon-frac').value = props.carbonFraction;
      };

      window.resetSpParams = function() {
        syncSpDefaults();
        onSpChange();
      };

      window.resetSpEfficiency = function() {
        const val = selectedSawnProduct && SP_EFFICIENCY_DEFAULTS[selectedSawnProduct]
                    ? SP_EFFICIENCY_DEFAULTS[selectedSawnProduct] : 0.90;
        document.getElementById('sp-efficiency').value = val;
        onSpChange();
      };

      function calcSpVolume() {
        const t = selectedSawnType;
        if (t === 'lumber') {
          const th = parseFloat(document.getElementById('sp-thickness').value) / 1000;
          const w  = parseFloat(document.getElementById('sp-width').value) / 1000;
          const l  = parseFloat(document.getElementById('sp-length').value);
          const q  = parseFloat(document.getElementById('sp-qty').value) || 1;
          if (!th || !w || !l) return null;
          return { vol: th * w * l * q, label: `${document.getElementById('sp-thickness').value}×${document.getElementById('sp-width').value} mm × ${l} m × ${q} pcs` };
        } else if (t === 'panel') {
          const th = parseFloat(document.getElementById('sp-panel-t').value) / 1000;
          const w  = parseFloat(document.getElementById('sp-panel-w').value);
          const l  = parseFloat(document.getElementById('sp-panel-l').value);
          const q  = parseFloat(document.getElementById('sp-panel-q').value) || 1;
          if (!th || !w || !l) return null;
          return { vol: th * w * l * q, label: `${document.getElementById('sp-panel-t').value} mm × ${w}×${l} m × ${q} sheets` };
        } else if (t === 'engineered') {
          const d  = parseFloat(document.getElementById('sp-eng-d').value) / 1000;
          const w  = parseFloat(document.getElementById('sp-eng-w').value) / 1000;
          const l  = parseFloat(document.getElementById('sp-eng-l').value);
          const q  = parseFloat(document.getElementById('sp-eng-q').value) || 1;
          if (!d || !w || !l) return null;
          return { vol: d * w * l * q, label: `Engineered ${document.getElementById('sp-eng-d').value}×${document.getElementById('sp-eng-w').value} mm × ${l} m × ${q} pcs` };
        } else {
          const vol = parseFloat(document.getElementById('sp-other-vol').value);
          if (!vol) return null;
          return { vol, label: document.getElementById('sp-other-desc').value || 'Custom volume' };
        }
      }

      window.onSpChange = function() {
        const wt = document.getElementById('sp-woodtype').value;
        const density = parseFloat(document.getElementById('sp-density').value) || SP_WOOD_PROPS[wt].density;
        const cfrac   = parseFloat(document.getElementById('sp-carbon-frac').value) || SP_WOOD_PROPS[wt].carbonFraction;
        const eff     = parseFloat(document.getElementById('sp-efficiency').value) || 0.90;
        const vr = calcSpVolume();
        if (vr && vr.vol > 0) {
          const mass = vr.vol * density;
          const cTotal = mass * cfrac;
          const cProduct = cTotal * eff;
          document.getElementById('sp-estimate').classList.remove('hidden');
          document.getElementById('sp-estimate-display').innerHTML =
            `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">` +
              statTile('Volume', vr.vol.toFixed(4) + ' m³') +
              statTile('Mass', mass.toFixed(1) + ' kg') +
              statTile('Total carbon', cTotal.toFixed(2) + ' kg C') +
              statTile('Serviceable carbon', cProduct.toFixed(2) + ' kg C') +
            `</div>` +
            `<p class="text-xs text-gray-500 mt-3">${vr.label} &middot; conversion efficiency ${(eff*100).toFixed(0)}%</p>`;
          if (!selectedSawnProduct) {
            const sug = (selectedSawnType === 'panel' || selectedSawnType === 'engineered') ? 'Construction' : 'Household';
            selectSpProduct(sug);
          }
        }
      };

      window.selectSpProduct = function(name) {
        selectedSawnProduct = name;
        renderParamBox('sp-param-box', name, 'spp');
        document.querySelectorAll('#sp-product-grid .product-card').forEach(card => {
          card.classList.toggle('selected', card.dataset.product === name);
        });
        const effField = document.getElementById('sp-efficiency');
        if (effField && SP_EFFICIENCY_DEFAULTS[name]) {
          const cur = parseFloat(effField.value);
          const isDefault = Object.values(SP_EFFICIENCY_DEFAULTS).some(v => Math.abs(v - cur) < 0.001);
          if (isDefault) effField.value = SP_EFFICIENCY_DEFAULTS[name];
        }
        onSpChange();
      };

      function setSpStatus(msg) { document.getElementById('sp-status').textContent = msg; }

      window.runSpTracker = async function() {
        if (!pyReady) {
          setSpStatus('⏳ Loading…');
          await initPy();
          if (!pyReady) { setSpStatus('❌ Loading failed.'); return; }
        }
        if (!selectedSawnProduct) { setSpStatus('Please select an end-use category first.'); return; }

        const wt = document.getElementById('sp-woodtype').value;
        const nYears  = parseInt(document.getElementById('sp-years').value) || 100;
        const density = parseFloat(document.getElementById('sp-density').value) || SP_WOOD_PROPS[wt].density;
        const cfrac   = parseFloat(document.getElementById('sp-carbon-frac').value) || SP_WOOD_PROPS[wt].carbonFraction;
        const eff     = parseFloat(document.getElementById('sp-efficiency').value) || 0.90;
        const vr = calcSpVolume();
        if (!vr || vr.vol <= 0) { setSpStatus('Please enter valid product dimensions.'); return; }

        const mass       = vr.vol * density;
        const cTotal     = mass * cfrac;
        const carbonKg   = cTotal * eff;   // serviceable carbon entering the product
        setSpStatus('Running carbon tracker…');

        try {
          pyodide.globals.set('pps_carbon_kg',    carbonKg);
          pyodide.globals.set('sp_product_name', selectedSawnProduct);
          pyodide.globals.set('sp_n_years',      nYears);
          pyodide.FS.writeFile('/data/_sp_paras.csv', buildParaCSV('spp', selectedSawnProduct));
          pyodide.globals.set('pps_para_path', '/data/_sp_paras.csv');

          const jsonStr = await pyodide.runPythonAsync(`
import pandas as pd, json, math, sys
sys.path.append('/app')
import WPsCT_Functions as wf

para = pd.read_csv(pps_para_path)
prod = sp_product_name
n    = int(sp_n_years)
C0   = float(pps_carbon_kg)

def get_para(product, variable):
    rows = para.loc[(para['Product'] == product) & (para['Variable'] == variable), 'Parameter']
    return float(rows.values[0]) if len(rows) > 0 else 0.0

production = [C0] + [0.0] * (n - 1)
dp1 = get_para(prod, 'disposal_1')
dp2 = get_para(prod, 'disposal_2')
dp3 = get_para(prod, 'disposal_3')
inuse_raw, _ = wf.disposal_CF(n, production, dp1, dp2, dp3)
inuse_arr = [max(0.0, float(v)) for v in inuse_raw]

landfill_in_raw = []
for i in range(n):
    prev = inuse_arr[i-1] if i > 0 else C0
    landfill_in_raw.append(max(0.0, prev - inuse_arr[i]))

rp1_rows = para.loc[(para['Product'] == prod) & (para['Variable'] == 'recycle_1'), 'Parameter']
if len(rp1_rows) > 0:
    rp1 = float(rp1_rows.values[0]); rp2 = get_para(prod, 'recycle_2')
    rr = [min(1.0, max(0.0, rp1 + rp2 * math.log(max(i+1.0,1e-12)))) for i in range(n)]
    landfill_in = [landfill_in_raw[i] * (1.0 - rr[i]) for i in range(n)]
else:
    landfill_in = landfill_in_raw[:]

lf_map = {
    'Construction':('con_decay1','con_decay2'),'Exterior':('ext_decay1','ext_decay2'),
    'Household':('hou_decay1','hou_decay2'),'Graphic Paper':('pap_decay1','pap_decay2'),
    'Other Paper':('pap_decay1','pap_decay2'),'Household Paper':('pap_decay1','pap_decay2'),
}
k2 = get_para('Landfill', lf_map.get(prod, ('con_decay1','con_decay2'))[1])
decay_rate = math.log(2.0) / max(k2, 0.01)
lf_pool_arr = [max(0.0, sum(landfill_in[j]*math.exp(-decay_rate*(i-j)) for j in range(i+1))) for i in range(n)]

years_arr      = list(range(1, n+1))
total_retained = [max(0.0, inuse_arr[i]+lf_pool_arr[i]) for i in range(n)]
cumul_released = [max(0.0, min(C0, C0-total_retained[i])) for i in range(n)]
out = {'years':years_arr,'inuse':inuse_arr,'lf_pool':lf_pool_arr,
       'total_retained':total_retained,'cumul_released':cumul_released,'C0':C0}
json.dumps(out, allow_nan=False)
          `);

          const res = JSON.parse(jsonStr);
          renderSpResults(res, cTotal, carbonKg, eff, vr, wt, nYears);
          setSpStatus(`Done - tracked ${nYears} years for ${selectedSawnProduct} (${vr.label}).`);
        } catch(err) {
          console.error(err);
          setSpStatus('Run failed. See browser console.');
        }
      };

      function renderSpResults(res, cTotal, carbonKg, eff, vr, wt, nYears) {
        const finalRetained = res.total_retained[res.total_retained.length-1];
        const finalReleased = res.cumul_released[res.cumul_released.length-1];
        const retPct = (finalRetained/carbonKg*100).toFixed(1);
        const relPct = (finalReleased/carbonKg*100).toFixed(1);
        const effPct = (eff*100).toFixed(0);

        document.getElementById('sp-summary-badges').innerHTML = `
          <div class="flex flex-col items-center p-3 bg-gray-50 rounded-xl border border-gray-200">
            <span class="text-lg font-bold text-gray-700">${cTotal.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Total product carbon</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-teal-50 rounded-xl border border-teal-200">
            <span class="text-lg font-bold text-teal-700">${carbonKg.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Serviceable carbon<br>(${effPct}% efficiency)</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-blue-50 rounded-xl border border-blue-200">
            <span class="text-lg font-bold text-blue-700">${finalRetained.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Retained at year ${nYears}<br>(${retPct}%)</span>
          </div>
          <div class="flex flex-col items-center p-3 bg-red-50 rounded-xl border border-red-200">
            <span class="text-lg font-bold text-red-600">${finalReleased.toFixed(2)} kg C</span>
            <span class="text-xs text-gray-500 mt-1 text-center">Released at year ${nYears}<br>(${relPct}%)</span>
          </div>`;
        document.getElementById('sp-summary-panel').classList.remove('hidden');

        const traces = [
          { x:res.years, y:res.total_retained, mode:'lines', name:'Total Retained',
            line:{color:'#0d9488',width:2.5}, fill:'tozeroy', fillcolor:'rgba(13,148,136,0.08)' },
          { x:res.years, y:res.inuse, mode:'lines', name:'In-use Pool',
            line:{color:'#2563eb',width:2,dash:'dot'} },
          { x:res.years, y:res.lf_pool, mode:'lines', name:'Landfill Pool',
            line:{color:'#9333ea',width:2,dash:'dash'} },
          { x:res.years, y:res.cumul_released, mode:'lines', name:'Cumulative Released',
            line:{color:'#dc2626',width:2}, fill:'tozeroy', fillcolor:'rgba(220,38,38,0.06)' }
        ];
        Plotly.newPlot('sp-plot-area', traces, {
          autosize:true, margin:{l:65,r:20,t:50,b:80},
          legend:{orientation:'h',y:-0.28},
          xaxis:{title:{text:'Years after production',standoff:20}},
          yaxis:{title:{text:'Carbon (kg C)',standoff:12}},
          title:{text:`Primary Product Carbon - ${selectedSawnProduct} (${wt}, ${vr.vol.toFixed(4)} m³, eff.${effPct}%)`,font:{size:12}},
          hovermode:'x unified'
        }, { responsive:true, displayModeBar:true, displaylogo:false, modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'], toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_primary'} });

        let html = '<table style="border-collapse:collapse;width:100%;font-size:0.78rem"><thead><tr style="background:#f1f5f9">';
        ['Year','In-use (kg C)','Landfill Pool (kg C)','Total Retained (kg C)','Cumul. Released (kg C)'].forEach(h => {
          html += `<th style="border:1px solid #e2e8f0;padding:3px 7px;text-align:right">${h}</th>`;
        });
        html += '</tr></thead><tbody>';
        for (let i=0; i<res.years.length; i++) {
          if (i>=20 && (i+1)%5!==0) continue;
          const bg = i%2===0?'#fff':'#f8fafc';
          html += `<tr style="background:${bg}">`;
          [res.years[i], res.inuse[i].toFixed(3), res.lf_pool[i].toFixed(3),
           res.total_retained[i].toFixed(3), res.cumul_released[i].toFixed(3)].forEach(v => {
            html += `<td style="border:1px solid #e2e8f0;padding:3px 7px;text-align:right">${v}</td>`;
          });
          html += '</tr>';
        }
        html += '</tbody></table>';
        document.getElementById('sp-results-preview').innerHTML = html;

        let csv = `Year,InUse_kgC,LandfillPool_kgC,TotalRetained_kgC,CumulReleased_kgC\n# SpCarbon=${cTotal.toFixed(4)} ServiceableCarbon=${carbonKg.toFixed(4)} Efficiency=${eff} Volume=${vr.vol.toFixed(4)}m3 Product=${selectedSawnProduct}\n`;
        for (let i=0; i<res.years.length; i++) {
          csv += `${res.years[i]},${res.inuse[i].toFixed(4)},${res.lf_pool[i].toFixed(4)},${res.total_retained[i].toFixed(4)},${res.cumul_released[i].toFixed(4)}\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const link = document.getElementById('sp-download-link');
        link.href = URL.createObjectURL(blob);
        link.classList.remove('hidden');
      }

      window.clearSpTracker = function clearSpTracker() {
        selectedSawnProduct = null;
        document.querySelectorAll('#sp-product-grid .product-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('sp-summary-panel').classList.add('hidden');
        document.getElementById('sp-results-preview').innerHTML = '';
        document.getElementById('sp-download-link').classList.add('hidden');
        document.getElementById('sp-estimate').classList.add('hidden');
        document.getElementById('sp-suggestion-note').classList.add('hidden');
        Plotly.purge('sp-plot-area');
        setSpStatus('Cleared. Select end-use category and run again.');
      }

      onSpChange()

      /* ===================== Sensitivity Analysis tab ===================== */
      let sensParaRecords = null;   // null = use the default parameter file
      const TG = 1e9;               // kg C -> Tg C for display
      function setSensStatus(m){ const e=document.getElementById('sens-status'); if(e) e.textContent=m; }
      function setSensProgress(frac){
        const w=document.getElementById('sens-progress-wrap'), b=document.getElementById('sens-progress-bar');
        if(!w||!b) return;
        if(frac==null){ w.classList.add('hidden'); b.style.width='0%'; return; }
        w.classList.remove('hidden'); b.style.width = Math.max(2, Math.round(frac*100))+'%';
      }
      const yieldUI = () => new Promise(r=>setTimeout(r, 0));   // yield a macrotask so the page stays responsive
      async function sensEnsurePy(){
        if(!pyReady){ setSensStatus('⏳ Loading… (first run downloads Python, ~30-60 s)'); await initPy(); }
        return pyReady;
      }
      async function sensCall(pyExpr){
        const code = "import json, pandas as pd, sys\n" +
                     "sys.path.append('/app')\n" +
                     "import WPsCT_Sensitivity as ws\n" +
                     "json.dumps(" + pyExpr + ")\n";
        return JSON.parse(await pyodide.runPythonAsync(code));
      }
      // The active parameter records (generated set, or the default file) - fetched once per run.
      async function sensGetRecords(){
        if(sensParaRecords) return sensParaRecords;
        return await sensCall("pd.read_csv('/data/WPs_Tracker_paras.csv').to_dict('records')");
      }
      let sensUploadText = null;
      function sensData(){
        const v = document.getElementById('sens-data').value;
        if (v === 'upload'){
          if (!sensUploadText) return null;
          try { pyodide.FS.writeFile('/data/_sens_upload.csv', sensUploadText); } catch(e){ return null; }
          return '/data/_sens_upload.csv';
        }
        return v;
      }
      window.sensDataChanged = function(){
        const f = document.getElementById('sens-data-file');
        if (f) f.classList.toggle('hidden', document.getElementById('sens-data').value !== 'upload');
      };
      window.sensUploadData = function(ev){
        const file = ev.target.files && ev.target.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = () => { sensUploadText = String(r.result); setSensStatus('Loaded "' + file.name + '" - choose what to vary and run.'); };
        r.onerror = () => setSensStatus('❌ Could not read that file.');
        r.readAsText(file);
      };
      const SENS_CFG = { responsive:true, displayModeBar:true, displaylogo:false,
                         modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d'] };

      // ---- Parameter generator (built entirely in JS from the inputs) ----
      const SQRT2PI_E = Math.exp(Math.sqrt(2 * Math.PI));   // e^sqrt(2*pi): links dp1 and the peak rate
      const SG_SOLID = ['Construction','Exterior','Household'];
      const SG_PAPER = [['Graphic Paper','GraphicPaper'],['Other Paper','OtherPaper'],['Household Paper','HouseholdPaper']];
      const SG_RECYC = [['Construction','Construction'],['Household','Household'],['Graphic Paper','GraphicPaper'],['Other Paper','OtherPaper']];
      const SG_LF    = ['con','ext','hou','pap'];
      function sgNum(id){ const e=document.getElementById(id); return e?parseFloat(e.value):NaN; }
      function sgRound(x){ return Math.round(x*1e6)/1e6; }
      function _erf(x){ const s=x<0?-1:1; x=Math.abs(x); const t=1/(1+0.3275911*x);
        const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
        return s*y; }
      function _normCdf(z){ return 0.5*(1+_erf(z/Math.SQRT2)); }

      // Build the full tracker parameter set (Product, Variable, Parameter) from the generator inputs.
      function sgBuildRecords(){
        const recs=[];
        SG_SOLID.forEach(function(name){
          const L=sgNum('sg-hl-'+name), a=sgNum('sg-pk-'+name);
          recs.push({Product:name,Variable:'disposal_1',Parameter:sgRound(a*SQRT2PI_E)});
          recs.push({Product:name,Variable:'disposal_2',Parameter:sgRound(Math.PI*L*a*a)});
          recs.push({Product:name,Variable:'disposal_3',Parameter:L});
        });
        SG_PAPER.forEach(function(p){
          const L=sgNum('sg-hl-'+p[1]), a=0.5/L;
          recs.push({Product:p[0],Variable:'disposal_1',Parameter:sgRound(a*SQRT2PI_E)});
          recs.push({Product:p[0],Variable:'disposal_2',Parameter:0});
          recs.push({Product:p[0],Variable:'disposal_3',Parameter:L});
        });
        SG_RECYC.forEach(function(p){
          recs.push({Product:p[0],Variable:'recycle_1',Parameter:sgNum('sg-r1-'+p[1])});
          recs.push({Product:p[0],Variable:'recycle_2',Parameter:sgNum('sg-r2-'+p[1])});
        });
        SG_LF.forEach(function(c){
          recs.push({Product:'Landfill',Variable:c+'_decay1',Parameter:sgNum('sg-lf1-'+c)});
          recs.push({Product:'Landfill',Variable:c+'_decay2',Parameter:sgNum('sg-lf2-'+c)});
        });
        recs.push({Product:'Biofuel',Variable:'efficiency',Parameter:sgNum('sg-biofuel')});
        recs.push({Product:'Biochar',Variable:'decay_1',Parameter:sgNum('sg-bc1')});
        recs.push({Product:'Biochar',Variable:'decay_2',Parameter:sgNum('sg-bc2')});
        return recs;
      }

      window.sensGenerate = function(){
        try{
          sensParaRecords = sgBuildRecords();
          const w = SG_SOLID.map(function(n){ const L=sgNum('sg-hl-'+n),a=sgNum('sg-pk-'+n); return n.slice(0,4)+' '+sgRound(Math.PI*L*a*a); });
          document.getElementById('sg-note').textContent =
            'Generated '+sensParaRecords.length+' parameters (now used by the analyses below). Derived widths: '+w.join(', ')+'.';
          setSensStatus('Parameters generated and active. Use Download to save the file.');
          sgRedraw();
        }catch(e){ console.error(e); document.getElementById('sg-note').textContent='Please check the input values.'; }
      };

      window.sgDownload = function(){
        const recs=sgBuildRecords(); sensParaRecords=recs;
        let csv='Product,Variable,Parameter\n';
        recs.forEach(function(r){ const p=String(r.Product).indexOf(',')>=0?'"'+r.Product+'"':r.Product; csv+=p+','+r.Variable+','+r.Parameter+'\n'; });
        const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download='WPsCT_parameters.csv'; a.click();
        setSensStatus('Parameter file downloaded (usable in End-use Products -> upload parameters).');
      };

      // ---- Live curve preview (disposal / recycling / landfill) with add-to-compare ----
      let sgCurves=[];
      function sgItemsFor(type){
        if(type==='disposal') return [['Construction','Construction'],['Exterior','Exterior'],['Household','Household'],['Graphic Paper','GraphicPaper'],['Other Paper','OtherPaper'],['Household Paper','HouseholdPaper']];
        if(type==='recycling') return [['Construction','Construction'],['Household','Household'],['Graphic Paper','GraphicPaper'],['Other Paper','OtherPaper']];
        return [['Construction','con'],['Exterior','ext'],['Household','hou'],['Paper','pap']];
      }
      window.sgTypeChanged = function(){
        const type=document.getElementById('sg-curve-type').value, sel=document.getElementById('sg-curve-item');
        sel.innerHTML = sgItemsFor(type).map(function(it){ return '<option value="'+it[1]+'">'+it[0]+'</option>'; }).join('');
        sgRedraw();
      };
      function sgComputeCurve(type, key){
        const x=[], y=[]; let ylab='', xlab='';
        if(type==='disposal'){
          const paper=['GraphicPaper','OtherPaper','HouseholdPaper'].indexOf(key)>=0;
          const L=sgNum('sg-hl-'+key), a=paper?(0.5/L):sgNum('sg-pk-'+key), dp2=paper?0:(Math.PI*L*a*a);
          const tmax=Math.max(60, Math.ceil(paper?6*L:2.4*L));
          for(let t=0;t<=tmax;t++){ x.push(t); y.push(a*Math.exp(-dp2*(t-L)*(t-L)/Math.max(L,1e-9))); }
          ylab='Annual disposal rate'; xlab='Product age (years)';
        } else if(type==='recycling'){
          const r1=sgNum('sg-r1-'+key), r2=sgNum('sg-r2-'+key);
          for(let k=0;k<=50;k++){ x.push(k); y.push(Math.min(1,Math.max(0,r1+r2*Math.log(k+1)))); }
          ylab='Recycling rate'; xlab='Years since production';
        } else {
          const k1=sgNum('sg-lf1-'+key), k2=sgNum('sg-lf2-'+key);
          for(let t=0;t<=200;t++){ x.push(t); y.push(t===0?1:Math.max(0,Math.min(1,1-_normCdf((Math.log(t)-k1)/k2)))); }
          ylab='Fraction remaining in landfill'; xlab='Years since disposal';
        }
        return {x:x,y:y,ylab:ylab,xlab:xlab};
      }
      window.sgRedraw = function(){
        const tsel=document.getElementById('sg-curve-type'); if(!tsel) return;
        const isel=document.getElementById('sg-curve-item'); if(!isel||!isel.value) return;
        const type=tsel.value, key=isel.value, name=isel.selectedOptions[0].text;
        const cur=sgComputeCurve(type,key);
        const traces=sgCurves.map(function(c){ return {x:c.x,y:c.y,mode:'lines',name:c.name,line:{width:2}}; });
        traces.push({x:cur.x,y:cur.y,mode:'lines',name:name+' (current)',line:{color:'#a21caf',width:3}});
        Plotly.newPlot('sg-curve-plot', traces,
          { margin:{l:60,r:15,t:10,b:45}, xaxis:{title:cur.xlab}, yaxis:{title:cur.ylab}, legend:{orientation:'h',y:-0.25} },
          { responsive:true, displaylogo:false, modeBarButtonsToRemove:['select2d','lasso2d'] });
      };
      window.sgAddCurve = function(){
        const isel=document.getElementById('sg-curve-item');
        const c=sgComputeCurve(document.getElementById('sg-curve-type').value, isel.value);
        c.name=isel.selectedOptions[0].text; sgCurves.push(c); if(sgCurves.length>6) sgCurves.shift();
        sgRedraw();
      };
      window.sgClearCurves = function(){ sgCurves=[]; sgRedraw(); };

      // ---- Sub-tabs: show one analysis (controls + plot) at a time ----
      window.switchSensSub = function(name){
        ['response','influence','uncertainty'].forEach(function(n){
          const ctl=document.getElementById('sensctl-'+n), plot=document.getElementById('sensplot-'+n), btn=document.getElementById('senstab-'+n);
          if(ctl) ctl.classList.toggle('hidden', n!==name);
          if(plot) plot.classList.toggle('hidden', n!==name);
          if(btn) btn.classList.toggle('sens-subtab-active', n===name);
        });
      };

      // ---- Sensitivity on real data (loops in JS: progress + yielding, no freeze) ----
      const SENS_VARY = {
        'sl:Construction':    {axis:'Construction service life (yr)',     min:20,  max:160},
        'sl:Exterior':        {axis:'Exterior service life (yr)',         min:5,   max:60},
        'sl:Household':       {axis:'Household service life (yr)',        min:10,  max:60},
        'sl:Graphic Paper':   {axis:'Graphic Paper service life (yr)',    min:1,   max:15},
        'sl:Other Paper':     {axis:'Other Paper service life (yr)',      min:0.5, max:5},
        'sl:Household Paper': {axis:'Household Paper service life (yr)',  min:0.2, max:3},
        'recabs:all':         {axis:'Recycling rate (0-1)',              min:0,   max:0.5},
        'lfabs:all':          {axis:'Landfill turnover (yr)',            min:5,   max:60}
      };
      window.sensSpecChanged = function(){
        const v = SENS_VARY[document.getElementById('sens-spec').value];
        if(!v) return;
        document.getElementById('sens-min').value = v.min;
        document.getElementById('sens-max').value = v.max;
      };
      async function sensRunPoint(dp, recs, mods){
        return await sensCall("ws.run_point("+JSON.stringify(dp)+", "+recs+", "+JSON.stringify(mods)+")");
      }
      function sensPctile(arr,q){ const s=[...arr].sort((a,b)=>a-b); const k=(s.length-1)*q,f=Math.floor(k),c=Math.ceil(k); return f===c?s[f]:s[f]+(s[c]-s[f])*(k-f); }

      window.runSensResponse = async function(){
        if(!(await sensEnsurePy())){ setSensStatus('❌ Loading failed.'); return; }
        const spec=document.getElementById('sens-spec').value;
        const mn=parseFloat(document.getElementById('sens-min').value), mx=parseFloat(document.getElementById('sens-max').value);
        const steps=Math.max(2,parseInt(document.getElementById('sens-steps').value)||9);
        const values=[]; for(let i=0;i<steps;i++) values.push(+(mn+(mx-mn)*i/(steps-1)).toFixed(6));
        setSensProgress(0);
        try{
          const dp=sensData(); if(!dp){ setSensStatus('Please choose an input dataset or upload your own.'); setSensProgress(null); return; }
          const recs=JSON.stringify(await sensGetRecords()), finals=[];
          for(let i=0;i<values.length;i++){
            setSensStatus('Running… '+(i+1)+'/'+steps);
            const r=await sensRunPoint(dp, recs, [[spec, values[i]]]);
            finals.push(r.final); setSensProgress((i+1)/steps); await yieldUI();
          }
          Plotly.newPlot('sens-response-plot', [
            { x:values, y:finals.map(v=>v/TG), mode:'lines+markers', line:{color:'#a21caf',width:2.5} }
          ], { margin:{l:70,r:20,t:10,b:50},
               xaxis:{title: (SENS_VARY[spec]||{}).axis || 'Parameter value'},
               yaxis:{title:'Total stored carbon (Tg C)', separatethousands:true} },
            Object.assign({toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_sensitivity_response'}}, SENS_CFG));
          setSensStatus('Done ('+steps+' runs).');
        }catch(e){ console.error(e); setSensStatus('❌ Run failed - see console.'); }
        setSensProgress(null);
      };

      window.runSensTornado = async function(){
        if(!(await sensEnsurePy())){ setSensStatus('❌ Loading failed.'); return; }
        const pct=parseFloat(document.getElementById('sens-pct').value)||20, f=pct/100;
        const specs=[['sl:all','All service lives'],['rec:all','Recycling rate'],['lf:all','Landfill turnover']];
        setSensProgress(0);
        try{
          const dp=sensData(); if(!dp){ setSensStatus('Please choose an input dataset or upload your own.'); setSensProgress(null); return; }
          const recs=JSON.stringify(await sensGetRecords());
          const total=1+specs.length*2; let step=0;
          setSensStatus('Influence… base run'); const base=(await sensRunPoint(dp,recs,[])).final; setSensProgress(++step/total); await yieldUI();
          const rows=[];
          for(const [spec,label] of specs){
            setSensStatus('Influence… '+label);
            const lo=(await sensRunPoint(dp,recs,[[spec,1-f]])).final; setSensProgress(++step/total); await yieldUI();
            const hi=(await sensRunPoint(dp,recs,[[spec,1+f]])).final; setSensProgress(++step/total); await yieldUI();
            rows.push({label,lo,hi,span:Math.abs(hi-lo)});
          }
          rows.sort((a,b)=>b.span-a.span);
          const baseT=base/TG, names=rows.map(r=>r.label);
          const lx=[], ly=[];
          rows.forEach(function(r){ lx.push(r.lo/TG, r.hi/TG, null); ly.push(r.label, r.label, null); });
          Plotly.newPlot('sens-tornado-plot', [
            { x:lx, y:ly, mode:'lines', line:{color:'#e5d0ee',width:6}, hoverinfo:'skip', showlegend:false },
            { x:rows.map(r=>r.lo/TG), y:names, mode:'markers', name:'-'+pct+'%', marker:{color:'#c084fc',size:15,line:{color:'#a21caf',width:1}} },
            { x:rows.map(r=>r.hi/TG), y:names, mode:'markers', name:'+'+pct+'%', marker:{color:'#7c3aed',size:15,line:{color:'#5b21b6',width:1}} }
          ], { margin:{l:140,r:20,t:10,b:45}, legend:{orientation:'h',y:-0.25}, yaxis:{automargin:true},
               xaxis:{title:'Total stored carbon (Tg C)', separatethousands:true},
               shapes:[{type:'line',x0:baseT,x1:baseT,yref:'paper',y0:0,y1:1,line:{color:'#6b7280',width:1.5,dash:'dash'}}] },
            Object.assign({toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_influence'}}, SENS_CFG));
          setSensStatus('Influence done. Dashed line = default ('+baseT.toFixed(0)+' Tg C); dots = -/+ '+pct+'% for each group.');
        }catch(e){ console.error(e); setSensStatus('❌ Run failed - see console.'); }
        setSensProgress(null);
      };

      window.runSensMC = async function(){
        if(!(await sensEnsurePy())){ setSensStatus('❌ Loading failed.'); return; }
        const N=Math.max(20,parseInt(document.getElementById('sens-n').value)||120), spread=0.3;
        setSensProgress(0);
        try{
          const dp=sensData(); if(!dp){ setSensStatus('Please choose an input dataset or upload your own.'); setSensProgress(null); return; }
          const recs=JSON.stringify(await sensGetRecords());
          let seed=12345; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
          const samp=()=>1-spread+2*spread*rnd();
          const paths=[], finals=[];
          for(let i=0;i<N;i++){
            const r=await sensRunPoint(dp, recs, [['sl:all',samp()],['rec:all',samp()],['lf:all',samp()]]);
            paths.push(r.total); finals.push(r.final);
            setSensStatus('Monte Carlo… '+(i+1)+'/'+N); setSensProgress((i+1)/N); await yieldUI();
          }
          const yrs=paths[0].map((_,i)=>i), col=(i)=>paths.map(p=>p[i]);
          const p05=yrs.map(i=>sensPctile(col(i),0.05)/TG), p50=yrs.map(i=>sensPctile(col(i),0.5)/TG), p95=yrs.map(i=>sensPctile(col(i),0.95)/TG);
          Plotly.newPlot('sens-mc-plot', [
            { x:yrs, y:p95, mode:'lines', line:{width:0}, showlegend:false, hoverinfo:'skip' },
            { x:yrs, y:p05, mode:'lines', line:{width:0}, fill:'tonexty', fillcolor:'rgba(162,28,175,0.15)', name:'5-95%' },
            { x:yrs, y:p50, mode:'lines', line:{color:'#a21caf',width:2.5}, name:'Median' }
          ], { margin:{l:70,r:20,t:10,b:50}, legend:{orientation:'h',y:-0.2},
               xaxis:{title:'Year index'}, yaxis:{title:'Total stored carbon (Tg C)', separatethousands:true} },
            Object.assign({toImageButtonOptions:{format:'png',scale:2,filename:'WPsCT_uncertainty'}}, SENS_CFG));
          const fp05=sensPctile(finals,0.05)/TG, fp50=sensPctile(finals,0.5)/TG, fp95=sensPctile(finals,0.95)/TG;
          setSensStatus('Uncertainty: final '+fp50.toFixed(0)+' Tg C (5-95%: '+fp05.toFixed(0)+'-'+fp95.toFixed(0)+').');
        }catch(e){ console.error(e); setSensStatus('❌ Run failed - see console.'); }
        setSensProgress(null);
      };

/* ---- Sensitivity tab: init the parameter-curve preview and refresh it when the tab opens ---- */
(function(){
  function initSG(){
    if(!document.getElementById('sg-curve-type')) return;
    if(typeof sgTypeChanged==='function') sgTypeChanged();
    document.querySelectorAll('.tab-btn').forEach(function(b){
      if(/Sensitiv/i.test(b.textContent)) b.addEventListener('click', function(){ setTimeout(function(){ if(typeof sgRedraw==='function') sgRedraw(); }, 40); });
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', initSG); else initSG();
})();
