#!/usr/bin/env python3
"""One-off seed builder (2026-09-13): assembles data/quotation-content.json from
the owner's approved artwork — English from OCR of q-page-03/09/10/11.jpg,
Malayalam from the owner's Malayalam quotation PDF (pdftotext). Kept in the
repo so the seed is reproducible; the live file is edited via the UI afterwards."""
import json, re, sys, datetime
OUT = sys.argv[1]; ML = open(sys.argv[2], encoding='utf-8').read(); EN10 = open(sys.argv[3], encoding='utf-8').read(); EN11 = open(sys.argv[4], encoding='utf-8').read()

def clauses(txt, fix=lambda s: s):
    txt = fix(txt)
    out = {}
    cur = None
    for line in txt.split('\n'):
        l = line.strip()
        if not l or l.startswith('Flarize') or 'Thannikakal' in l or l == 'by Golden Ray' or l.startswith('Terms and Conditions'): continue
        m = re.match(r'^(\d{1,2})\.\s*(.+?)\s*:\s*$', l)
        if m:
            cur = int(m.group(1)); out[cur] = {'title': m.group(2).strip(), 'body': []}
            continue
        if cur: out[cur]['body'].append(l)
    def clean(body):
        b = re.sub(r'\s+', ' ', ' '.join(body)).strip()
        # OCR of the artwork footer strip bleeds into the last clause on a page — cut it off.
        b = re.sub(r'\s*(F\s?la\s?rize|Flarize)\s.*?(flarize\.com|073 579).*$', '', b)
        b = re.sub(r'\s*Thannikakal.*$', '', b)
        return b.strip()
    return {k: {'title': v['title'], 'body': clean(v['body'])} for k, v in out.items()}

# ---------- Malayalam T&C (lines from 'നിബന്ധനകളും വ്യവസ്ഥകളും' to 'നിങ്ങളുടെ നിക്ഷേപത്തിന്റെ സംഗ്രഹം')
i = ML.rfind('നിബന്ധനകളും വ്യവസ്ഥകളും'); j = ML.find('നിങ്ങളുടെ നിക്ഷേപത്തിന്റെ സംഗ്രഹം', i)
mltc = ML[i:j].replace('‌', '').replace('ഡിസ്കൗ\n', 'ഡിസ്കൗ').replace('ഡിസ്കൗ ണ്ട്', 'ഡിസ്കൗണ്ട്')
mltc = re.sub(r'\n\s*ണ്ട്', 'ണ്ട്', mltc)
ml_terms = clauses(mltc)
# ---------- English T&C
en_terms = clauses(EN10 + '\n' + EN11, fix=lambda s: s.replace('ll. Statutory', '11. Statutory').replace('5. Service & Training:', '5. Service & Training :').replace('8. GST & Tax Changes:', '8. GST & Tax Changes :').replace('15. Retention of Title:', '15. Retention of Title :').replace('17. Force Majeure:', '17. Force Majeure :').replace('9. System Capacity & Product Confirmation:', '9. System Capacity & Product Confirmation :'))
assert len(en_terms) == 19 and len(ml_terms) == 19, (len(en_terms), len(ml_terms), sorted(en_terms), sorted(ml_terms))

def t(en, ml): return {'en': en, 'ml': ml}
terms = [{'title': t(en_terms[n]['title'], ml_terms[n]['title']), 'body': t(en_terms[n]['body'], ml_terms[n]['body'])} for n in range(1, 20)]

timeline = [
  {'days': t('1', '1'), 'title': t('Pay ₹5,000 — Slot Locked', '₹5,000 നൽകി നിങ്ങളുടെ സ്ലോട്ട് ഉറപ്പാക്കൂ'),
   'body': t("Lock your installation slot with a small booking fee and we'll begin the technical assessment right away.", 'ഒരു ചെറിയ ബുക്കിംഗ് തുക നൽകി ഇൻസ്റ്റലേഷൻ സ്ലോട്ട് ഉറപ്പാക്കുകയും, സാങ്കേതിക പരിശോധന ആരംഭിക്കുകയും ചെയ്യും.')},
  {'days': t('3-4', '3-4'), 'title': t('Site Inspection & Documentation', 'സൈറ്റ് പരിശോധനയും ഡോക്യുമെന്റേഷൻ നടപടികളും'),
   'body': t('Our team visits your site to evaluate roof, wiring, and shading. All measurements and documentation are managed by us.', 'ഞങ്ങളുടെ ടീം നിങ്ങളുടെ വീടും മേൽക്കൂരയും പരിശോധിക്കും. ആവശ്യമായ അളവുകളും രേഖകളും ഞങ്ങൾ കൈകാര്യം ചെയ്യും.')},
  {'days': t('5-7', '5-7'), 'title': t('Payment and Material Delivery', 'പേയ്‌മെന്റും മെറ്റീരിയൽ ഡെലിവറിയും'),
   'body': t('Solar panels, inverters and structures are delivered to site; the installation-stage payment (80% / loan amount) follows.', 'സോളാർ പാനൽ, ഇൻവെർട്ടർ, സ്ട്രക്ചർ എന്നിവ സൈറ്റിലെത്തിക്കും. തുടർന്ന് ഇൻസ്റ്റലേഷൻ ഘട്ടത്തിലെ പേയ്‌മെന്റ് പൂർത്തിയാക്കാം.')},
  {'days': t('9-13', '9-13'), 'title': t('Installation', 'ഇൻസ്റ്റലേഷൻ'),
   'body': t('We handle the full installation and system integration. Once complete, your solar system is ready to produce clean energy.', 'സിസ്റ്റത്തിന്റെ മുഴുവൻ ഇൻസ്റ്റലേഷനും ഞങ്ങൾ നിർവഹിക്കും. ഇൻസ്റ്റലേഷൻ പൂർത്തിയായാൽ നിങ്ങളുടെ Solar System ഉൽപ്പാദിപ്പിക്കാൻ തുടങ്ങും.')},
  {'days': t('14', '14'), 'title': t('Commissioning and Customer Orientation', 'കമ്മീഷനിംഗും ഉപഭോക്തൃ പരിശീലനവും'),
   'body': t('We commission the system and walk you through operation, safety and maintenance.', 'സിസ്റ്റം പ്രവർത്തനക്ഷമമാക്കി ഉപയോഗ രീതികൾ, സുരക്ഷാ നിർദേശങ്ങൾ, അറ്റകുറ്റപ്പണികൾ എന്നിവ വിശദീകരിക്കും.')},
  {'days': t('15-17', '15-17'), 'title': t('Net Meter Installation and Activation', 'Net Meter ഇൻസ്റ്റലേഷനും ആക്ടിവേഷനും'),
   'body': t('The net meter is installed and the system connected to the grid — you start using solar power.', 'Net Meter സ്ഥാപിച്ച് Grid-ലേക്ക് കണക്ട് ചെയ്യും. തുടർന്ന് Solar വഴി വൈദ്യുതി ഉപയോഗം ആരംഭിക്കാം.')},
]
weHandle = [
  t('Design the panels according to site-specific requirements', 'നിങ്ങളുടെ വീടിന് അനുയോജ്യമായ Solar System ഡിസൈനിംഗ്'),
  t('Analyze the site for shading and optimize panel placement', 'നിഴൽ പരിശോധനയും പാനൽ സ്ഥാപിക്കാനുള്ള മികച്ച സ്ഥാനം കണ്ടെത്തലും'),
  t('Procure Solar Panels, Inverter, Structure and BOQ according to project requirements', 'Solar Panel, Inverter, Structure, BOQ എന്നിവയുടെ ക്രമീകരണം'),
  t('Install all required components, fittings, and equipment', 'ആവശ്യമായ എല്ലാ ഉപകരണങ്ങളുടെയും ഇൻസ്റ്റലേഷൻ'),
  t('Test and commission the solar power plant; invite authorities for final approval before commissioning', 'സിസ്റ്റം പരിശോധന, കമ്മീഷനിംഗ്, ആവശ്യമായ അനുമതി നടപടികൾ'),
  t('Installation scope is limited to the DC side; solar meter installation is included', 'Solar Meter ഇൻസ്റ്റലേഷൻ ഉൾപ്പെടെയുള്ള DC Side ജോലികൾ'),
  t("Train the client's personnel on system operation, safety, and maintenance", 'സിസ്റ്റത്തിന്റെ ഉപയോഗം, സുരക്ഷ, പരിപാലനം എന്നിവയെക്കുറിച്ചുള്ള പരിശീലനം'),
]
customerScope = [
  t('Provide a shade-free roof area and a safe, weather-protected space for the inverter.', 'നിഴൽ ഇല്ലാത്ത മേൽക്കൂരയും ഇൻവെർട്ടറിനായി സുരക്ഷിതമായ സ്ഥലവും ഒരുക്കുക'),
  t('Arrange basic installation support, including water, electricity, storage space, and site access.', 'വെള്ളം, വൈദ്യുതി, സ്റ്റോറേജ് സൗകര്യം, സൈറ്റ് ആക്‌സസ് എന്നിവ ലഭ്യമാക്കുക'),
  t('Provide necessary technical provisions such as internet connectivity, termination points, CT/AC components, and upgrades required for HT or generator setups.', 'Internet Connection, CT/AC Components തുടങ്ങിയ ആവശ്യമായ സാങ്കേതിക സൗകര്യങ്ങൾ ഒരുക്കുക (ആവശ്യമെങ്കിൽ)'),
  t('Complete any KSEB-related requirements, including net metering formalities, load enhancement, consumer name change, ownership transfer, or other utility-related modifications, if applicable.', 'Net Metering, Load Enhancement, Name Change, Ownership Transfer തുടങ്ങിയ KSEB നടപടികൾ പൂർത്തിയാക്കുക (ബാധകമെങ്കിൽ)'),
  t('Pay applicable statutory fees, deposits, registration charges, and other charges imposed by KSEB or relevant authorities.', 'KSEB അല്ലെങ്കിൽ മറ്റ് അധികാരികൾ ഈടാക്കുന്ന ഫീസ്, ഡെപ്പോസിറ്റ്, രജിസ്ട്രേഷൻ ചാർജുകൾ എന്നിവ അടക്കുക'),
  t("Any civil work, roof repairs, waterproofing, structural modifications, trenching, masonry work, painting, restoration work, or additional structural work required for installation shall be under the customer's scope unless specifically included in the quotation.", 'Civil Work, Roof Repair, Waterproofing, Structural Modification, Trenching, Masonry Work തുടങ്ങിയ ജോലികൾ ക്വട്ടേഷനിൽ ഉൾപ്പെടുത്തിയിട്ടില്ലെങ്കിൽ ഉപഭോക്താവിന്റെ ഉത്തരവാദിത്വമായിരിക്കും.'),
]
requiredDocuments = [
  t('Bank Account details', 'ബാങ്ക് അക്കൗണ്ട് വിവരങ്ങൾ'),
  t('Aadhaar Card & PAN Card', 'ആധാർ കാർഡും PAN കാർഡും'),
  t('Address Proof', 'അഡ്രസ് പ്രൂഫ് (Address Proof)'),
  t('Salary slips / Bank statements (loan above ₹2 lakh)', 'ശമ്പള സ്ലിപ്പ് / ബാങ്ക് സ്റ്റേറ്റ്മെന്റ് (ലോൺ ₹2 ലക്ഷത്തിന് മുകളിൽ ആണെങ്കിൽ)'),
  t('Land tax / Building tax receipt', 'ഭൂനികുതി / കെട്ടിട നികുതി രസീത്'),
  t('Latest KSEB bill (2 months)', 'ഏറ്റവും പുതിയ 2 മാസത്തെ KSEB ബിൽ'),
  t('KSEB Feasibility Report', 'KSEB ഫീസിബിലിറ്റി റിപ്പോർട്ട്'),
  t('ITR (loan above ₹2 lakh)', 'ITR (ലോൺ ₹2 ലക്ഷത്തിന് മുകളിൽ ആണെങ്കിൽ)'),
]
lifeNow = [
  {'title': t('Limiting AC Usage', 'AC ഉപയോഗത്തിൽ നിയന്ത്രണം'), 'body': t('Constantly adjusting temperature, turning off rooms, compromising comfort', 'വൈദ്യുതി ബിൽ കൂടുമോ എന്ന ആശങ്ക കാരണം AC ഉപയോഗം പരിമിതപ്പെടുത്തേണ്ടി വരുന്നു.')},
  {'title': t('Electricity Anxiety', 'ഇന്ധനച്ചെലവിനെ ആശ്രയിക്കൽ'), 'body': t('Constant worry about power cuts, generator costs, UPS limitations', 'പെട്രോൾ, ഡീസൽ വില വർധിക്കുന്നത് കുടുംബ ബജറ്റിനെ ബാധിക്കുന്നു.')},
  {'title': t('Gas & Fuel Expenses', 'ഗ്യാസ്, ഇന്ധന ചെലവുകൾ'), 'body': t('Monthly LPG refills and rising fuel costs add to your household expenses', 'എൽ.പി.ജി. ഗ്യാസ് നിറയ്ക്കുന്നതിനും ഇന്ധന വില വർധനവിനും ഓരോ മാസവും അധിക ചെലവ് വരുന്നു.')},
]
lifeSolar = [
  {'title': t('Comfort Without Guilt', 'ആശങ്കകളില്ലാത്ത സൗകര്യം'), 'body': t('Use AC freely, perfect temperature always, no compromises needed', 'ബിൽ കൂടുമെന്ന ഭയം കൂടാതെ ACയും മറ്റ് ഉപകരണങ്ങളും കൂടുതൽ സ്വതന്ത്രമായി ഉപയോഗിക്കാം.')},
  {'title': t('Complete Confidence', 'സ്വന്തം വൈദ്യുതി ഉൽപ്പാദനം'), 'body': t('Peace of mind, future-ready home, smart investment that pays daily', 'നിങ്ങളുടെ വീട് തന്നെ ഒരു ചെറിയ പവർ സ്റ്റേഷനായി മാറുന്നു. Grid-നെ ആശ്രയിക്കുന്നത് കുറയുന്നു.')},
  {'title': t('Reduced Energy Expenses', 'ഊർജ്ജ ചെലവ് കുറയും'), 'body': t('Lower monthly spending on electricity and household energy.', 'വൈദ്യുതിക്കും മറ്റ് ഊർജ്ജ ആവശ്യങ്ങൾക്കും വരുന്ന മാസച്ചെലവ് കുറയും.')},
]
labels = {
  # page 1 (cover) — headline, stats band, letter, proposal-detail labels
  'p1.headline': t('Stop Worrying About Electricity Bills Forever', 'വൈദ്യുതി ബില്ലിനെ കുറിച്ചുള്ള ആശങ്കകൾക്ക് ഇനി വിട'),
  'p1.subline': t('Empowering Kerala homes with clean energy, smart savings, and the joy of sustainability.', 'സുരക്ഷിതമായ ഊർജ്ജം, മികച്ച ലാഭം, ദീർഘകാല സാമ്പത്തിക സുരക്ഷ — നിങ്ങളുടെ വീടിനായി.'),
  'p1.badge.subsidy': t('{amount} Subsidy', '{amount} സബ്‌സിഡി'), 'p1.badge.subsidy.sub': t('PM Surya Ghar – guaranteed', 'PM സൂര്യ ഘർ പദ്ധതിയിലൂടെ'),
  'p1.badge.homes': t('{count}+ Homes', '{count}+ Homes'), 'p1.badge.homes.sub': t('Installed in Kerala', 'വിജയകരമായ ഇൻസ്റ്റലേഷനുകൾ'),
  'p1.badge.mnre': t('MNRE Empanelled', 'MNRE Government'), 'p1.badge.mnre.sub': t('Government certified', 'അംഗീകൃത സ്ഥാപനം'),
  'p1.dear': t('Dear {name},', 'പ്രിയ {name}'),
  'p1.letter1': t('Thank you for considering Flarize for your home.', 'നിങ്ങളുടെ വീടിനായി Flarize തിരഞ്ഞെടുക്കാൻ താൽപര്യം പ്രകടിപ്പിച്ചതിന് നന്ദി.'),
  'p1.letter2': t("Choosing solar is one of the smartest decisions you can make for your home. It's more than reducing your electricity bill—it's about enjoying a better lifestyle, protecting your family from rising electricity costs, and investing in a home that continues to reward you for years to come.", 'സോളാർ തിരഞ്ഞെടുക്കുന്നത് വൈദ്യുതി ബിൽ കുറയ്ക്കാൻ മാത്രമല്ല. അത് നിങ്ങളുടെ കുടുംബത്തിന്റെ ഭാവിയിലേക്കുള്ള ഒരു മികച്ച നിക്ഷേപമാണ്. ഓരോ മാസവും ലാഭം നേടാനും, ഉയരുന്ന വൈദ്യുതി നിരക്കുകളിൽ നിന്ന് സംരക്ഷണം നേടാനും, വർഷങ്ങളോളം സ്വന്തം വൈദ്യുതി ഉപയോഗിക്കാനും ഇത് സഹായിക്കുന്നു.'),
  'p1.letter3': t("We've carefully designed this solution specifically for your home's energy needs, so you can make your decision with complete confidence.", 'നിങ്ങളുടെ വീട്ടിലെ വൈദ്യുതി ഉപയോഗം, ആവശ്യകത, ബജറ്റ് എന്നിവ കണക്കിലെടുത്താണ് ഈ സോളാർ പദ്ധതി പ്രത്യേകം തയ്യാറാക്കിയിരിക്കുന്നത്. അതിനാൽ നിങ്ങൾക്ക് ആത്മവിശ്വാസത്തോടെ തീരുമാനമെടുക്കാം.'),
  'p1.regards': t('Warm Regards,', 'സ്നേഹപൂർവ്വം'), 'p1.team': t('Team Flarize', 'Flarize ടീം'),
  'p1.details.title': t('YOUR PROPOSAL DETAILS', 'YOUR PROPOSAL DETAILS'),
  'p1.f.name': t('Name', 'പേര്'), 'p1.f.address': t('Address', 'വിലാസം'), 'p1.f.pincode': t('Pincode', 'പിൻകോഡ്'), 'p1.f.phone': t('Phone Number', 'ഫോൺ നമ്പർ'),
  'p1.f.bill': t('Current Bill', 'നിലവിലെ വൈദ്യുതി ബിൽ'), 'p1.f.size': t('System Size', 'സോളാർ സിസ്റ്റം'),
  'p1.f.qno': t('Quotation No.', 'ക്വട്ടേഷൻ നമ്പർ'), 'p1.f.by': t('Proposal By', 'നിർദ്ദേശം നൽകുന്നത്'), 'p1.f.date': t('Date', 'തീയതി'), 'p1.f.valid': t('Valid Until', 'കാലാവധി'),
  'p1.f.gst': t('GST No', 'GST നമ്പർ'), 'p1.f.reg': t('Company Registration', 'കമ്പനി രജിസ്ട്രേഷൻ നമ്പർ'),
  'p3.title': t('See Exactly What Your Solar Powers Every Day', 'നിങ്ങളുടെ Solar ഓരോ ദിവസവും എന്തെല്ലാം പ്രവർത്തിപ്പിക്കുന്നു'),
  'p3.subtitle': t('Real numbers calculated from your usage — not estimates.', 'നിങ്ങളുടെ വൈദ്യുതി ഉപയോഗത്തെ അടിസ്ഥാനമാക്കി കണക്കാക്കിയ യഥാർത്ഥ വിവരങ്ങൾ'),
  'p3.gen.label': t('Your Daily Solar Generation', 'പ്രതിദിന ഉൽപ്പാദനം'),
  'p3.gen.units': t('units', 'units'),
  'p3.gen.note': t('Average across all seasons', 'എല്ലാ സീസണുകളിലെയും ശരാശരി ഉൽപ്പാദനം'),
  'p3.value.label': t('Monthly Value at KSEB Rate', 'നിലവിലെ KSEB നിരക്കിൽ മാസത്തിലെ മൂല്യം'),
  'p3.value.note': t('Worth of free electricity every month', 'ഓരോ മാസവും ലഭിക്കുന്ന സൗജന്യ വൈദ്യുതിയുടെ മൂല്യം'),
  'p3.table.title': t('Your Daily Appliance Usage', 'നിങ്ങളുടെ വീടിന്റെ പ്രതിദിന വൈദ്യുതി ഉപയോഗം'),
  'p3.th.appliance': t('Appliance', 'ഉപകരണം'), 'p3.th.qty': t('Quantity', 'എണ്ണം'), 'p3.th.hours': t('Hours/Day', 'ദിവസേന'), 'p3.th.units': t('Units/Day', 'യൂണിറ്റ് / ദിവസം'),
  'p3.hrs': t('hrs', 'മണിക്കൂർ'), 'p3.hr': t('hr', 'മണിക്കൂർ'), 'p3.units': t('units', 'യൂണിറ്റ്'),
  'p3.total': t('Total Daily Usage:', 'ആകെ പ്രതിദിന ഉപയോഗം:'),
  'p3.card.gen': t('Solar Generates', 'Solar ഉൽപ്പാദിപ്പിക്കുന്നത്'), 'p3.card.use': t('Your Home Uses', 'നിങ്ങളുടെ വീടിന്റെ ഉപയോഗം'), 'p3.card.surplus': t('Surplus Exported', 'അധിക വൈദ്യുതി KSEB-ലേക്ക്'),
  'p3.card.gen.note': t('units/day (average)', 'യൂണിറ്റ് / ദിവസം'), 'p3.card.use.note': t('units/day (all appliances)', 'യൂണിറ്റ് / ദിവസം'), 'p3.card.surplus.note': t('units/day → KSEB credits', 'യൂണിറ്റ് / ദിവസം'),
  'p3.lifeNow': t('Your Life Now', 'ഇപ്പോഴത്തെ അവസ്ഥ'), 'p3.lifeSolar': t('Your Life with Solar', 'Solar-നൊപ്പം നിങ്ങളുടെ ജീവിതം'),
  'p9.title': t('From Booking to Savings — Step by Step', 'ബുക്കിംഗ് മുതൽ ലാഭം വരെ — ഓരോ ഘട്ടവും വ്യക്തമായി'),
  'p9.days': t('DAYS', 'ദിവസം'),
  'p9.refund.title': t('REFUND FROM KSEB', 'KSEB-യിൽ നിന്ന് ലഭിക്കുന്ന റീഫണ്ട്'),
  'p9.refund.body': t('80% of the pre-tax value of the registration fee is refunded by KSEB (₹1,000 per kW + 18% GST basis).', 'രജിസ്ട്രേഷൻ ഫീസിന്റെ Pre-Tax തുകയുടെ 80% വരെ KSEB-യിൽ നിന്ന് തിരികെ ലഭിക്കും. (₹1,000 per kW + 18% GST അടിസ്ഥാനത്തിൽ)'),
  'p9.refund.line': t('{kw} kW system — approx. ₹{amount} refund', '{kw} kW സിസ്റ്റത്തിന് ഏകദേശം ₹{amount} വരെ റീഫണ്ട്'),
  'p9.weHandle': t('WHAT WE HANDLE', 'ഞങ്ങൾ കൈകാര്യം ചെയ്യുന്നത്'), 'p9.customerScope': t('WHAT YOU NEED TO DO', 'നിങ്ങൾ ചെയ്യേണ്ടത് (CUSTOMER SCOPE)'),
  'p10.title': t('Terms and Conditions', 'നിബന്ധനകളും വ്യവസ്ഥകളും'),
  'p8.docs.title': t('Required Documents:', 'ആവശ്യമായ രേഖകൾ'),
  'p8.structure.label': t('Additional Structure Cost (if required)', 'അധിക Structure Cost (ആവശ്യമെങ്കിൽ)'),
}
# ---------- appliances: master (watts) + per-kW default profiles (qty, hours). units = qty*watts*hours/1000
master = [
  {'id': 'lights_fans', 'name': t('Lights + Fans', 'Lights + Fans'), 'icon': '💡', 'watts': 25, 'defaultHours': 5},
  {'id': 'refrigerator', 'name': t('Refrigerator', 'Refrigerator'), 'icon': '🧊', 'watts': 60, 'defaultHours': 24},
  {'id': 'induction', 'name': t('Induction Stove', 'Induction Stove'), 'icon': '🍳', 'watts': 1200, 'defaultHours': 1},
  {'id': 'washing_machine', 'name': t('Washing Machine', 'Washing Machine'), 'icon': '🪣', 'watts': 500, 'defaultHours': 1},
  {'id': 'tv_ott', 'name': t('TV + OTT', 'TV + OTT'), 'icon': '📺', 'watts': 100, 'defaultHours': 5},
  {'id': 'ac', 'name': t('Air Conditioner', 'Air Conditioner'), 'icon': '❄️', 'watts': 1200, 'defaultHours': 5},
  {'id': 'inverter_chargers', 'name': t('Inverter + Chargers', 'Inverter + Chargers'), 'icon': '🔌', 'watts': 20, 'defaultHours': 24},
  {'id': 'water_pump', 'name': t('Water Pump', 'Water Pump'), 'icon': '🚰', 'watts': 750, 'defaultHours': 1, 'optional': True},
  {'id': 'water_heater', 'name': t('Water Heater', 'Water Heater'), 'icon': '♨️', 'watts': 2000, 'defaultHours': 0.5, 'optional': True},
  {'id': 'ev_2w', 'name': t('EV Charging (2-wheeler)', 'EV Charging (2-wheeler)'), 'icon': '🛵', 'watts': 1000, 'defaultHours': 1, 'optional': True},
  {'id': 'ev_car', 'name': t('EV Charging (car)', 'EV Charging (car)'), 'icon': '🚗', 'watts': 3300, 'defaultHours': 1, 'optional': True},
]
def rows(*spec): return [{'id': i, 'qty': q, 'hours': h} for i, q, h in spec]
profiles = {
  '3':  rows(('lights_fans',10,5),('refrigerator',1,24),('induction',1,1),('washing_machine',1,1),('tv_ott',1,5),('ac',1,5),('inverter_chargers',1,24)),
  '5':  rows(('lights_fans',15,5),('refrigerator',1,24),('induction',1,1),('washing_machine',1,1),('tv_ott',1,5),('ac',2,5),('inverter_chargers',1,24),('water_pump',1,1)),
  '8':  rows(('lights_fans',20,5),('refrigerator',1,24),('induction',1,1.25),('washing_machine',1,1),('tv_ott',2,5),('ac',3,5),('water_pump',1,1),('water_heater',1,0.5),('ev_2w',1,1)),
  '10': rows(('lights_fans',25,5),('refrigerator',2,24),('induction',1,1.25),('washing_machine',1,1),('tv_ott',2,5),('ac',4,5),('water_pump',1,1),('water_heater',1,0.5),('ev_car',1,0.75)),
}
content = {
  'labels': labels, 'terms': terms, 'timeline': timeline, 'weHandle': weHandle, 'customerScope': customerScope,
  'requiredDocuments': requiredDocuments, 'lifeNow': lifeNow, 'lifeSolar': lifeSolar,
  'extraStructureCost': {'label': labels['p8.structure.label'], 'value': '₹4,500/kW'},
  'appliances': {'master': master, 'profiles': profiles},
}
now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
store = {
  'storeVersion': 'quotationContent.1',
  '_note': 'Customer-facing quotation text (EN + ML) for pages 3, 8, 9, 10, 11. Edit in Admin/Project Head → Quotation content; publish makes it live for NEW quotations only. Issued quotations keep the content version they were printed with.',
  'published': {'version': 1, 'publishedAt': now, 'publishedBy': 'SEED', 'content': content},
  'draft': {'version': 2, 'updatedAt': None, 'updatedBy': None, 'content': content},
}
json.dump(store, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
# sanity: profile totals vs generation (4 units/kW/day, must be <= 95%)
W = {m['id']: m['watts'] for m in master}
for kw, rs in profiles.items():
    tot = sum(r['qty'] * W[r['id']] * r['hours'] / 1000 for r in rs)
    print(f'{kw} kW: profile {tot:.2f} units vs gen {int(kw)*4} -> {tot/(int(kw)*4)*100:.0f}%')
print('EN clauses', len(en_terms), 'ML clauses', len(ml_terms), '-> wrote', OUT)
