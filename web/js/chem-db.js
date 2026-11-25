'use strict';
/* Chem-Draw: Trivialnamen-Datenbank (Vorlagen). Jede Vorlage: Name, Kategorie, SMILES und
 * wahlweise {alias: weitere Namen, iupac: IUPAC-Name (wo der Namensgenerator nicht reicht),
 * pre: 'L-'/'D-' (gilt für die gespeicherte Stereo-Form), base: Name ohne Stereo}.
 * Die Koordinaten erzeugt ChemLayout beim ersten Gebrauch.
 * 1.55: rund 300 weitere Einträge (Summenformeln geprüft in tests/chem/datenbank-test.js). */

const CHEM_DB_CATS = ['Kohlenwasserstoffe', 'Halogenverbindungen', 'Alkohole & Ether', 'Carbonylverbindungen', 'Säuren & Derivate',
  'Stickstoffverbindungen', 'Heterocyclen', 'Aminosäuren', 'Kohlenhydrate', 'Naturstoffe & Biomoleküle', 'Arzneistoffe',
  'Farbstoffe & Indikatoren', 'Anorganisch & Ionen', 'Peptid- & Oligosynthese', 'Nukleoside & Nukleotide'];

const CHEM_DB = [
  // Kohlenwasserstoffe
  ['Methan', 0, 'C', { alias: 'Erdgas, Sumpfgas' }],
  ['Ethan', 0, 'CC'],
  ['Propan', 0, 'CCC'],
  ['Butan', 0, 'CCCC', { alias: 'n-Butan' }],
  ['Isobutan', 0, 'CC(C)C'],
  ['Pentan', 0, 'CCCCC'],
  ['Hexan', 0, 'CCCCCC'],
  ['Heptan', 0, 'CCCCCCC'],
  ['Octan', 0, 'CCCCCCCC'],
  ['Isooctan', 0, 'CC(C)CC(C)(C)C', { alias: 'Oktanzahl 100' }],
  ['Neopentan', 0, 'CC(C)(C)C'],
  ['Ethen', 0, 'C=C', { alias: 'Ethylen' }],
  ['Propen', 0, 'CC=C', { alias: 'Propylen' }],
  ['But-1-en', 0, 'C=CCC'],
  ['Ethin', 0, 'C#C', { alias: 'Acetylen' }],
  ['Propin', 0, 'CC#C'],
  ['Buta-1,3-dien', 0, 'C=CC=C', { alias: 'Butadien' }],
  ['Isopren', 0, 'CC(=C)C=C'],
  ['Cyclopropan', 0, 'C1CC1'],
  ['Cyclopentan', 0, 'C1CCCC1'],
  ['Cyclohexan', 0, 'C1CCCCC1'],
  ['Cyclohexen', 0, 'C1CCC=CC1'],
  ['Benzol', 0, 'c1ccccc1', { alias: 'Benzen' }],
  ['Toluol', 0, 'Cc1ccccc1', { alias: 'Toluen' }],
  ['Ethylbenzol', 0, 'CCc1ccccc1'],
  ['o-Xylol', 0, 'Cc1ccccc1C'],
  ['m-Xylol', 0, 'Cc1cccc(C)c1'],
  ['p-Xylol', 0, 'Cc1ccc(C)cc1'],
  ['Styrol', 0, 'C=Cc1ccccc1', { alias: 'Vinylbenzol' }],
  ['Cumol', 0, 'CC(C)c1ccccc1'],
  ['Biphenyl', 0, 'c1ccc(cc1)-c1ccccc1', { iupac: '1,1′-Biphenyl' }],
  ['Naphthalin', 0, 'c1ccc2ccccc2c1', { iupac: 'Naphthalin', alias: 'Mottenkugeln' }],
  ['Anthracen', 0, 'c1ccc2cc3ccccc3cc2c1', { iupac: 'Anthracen' }],
  ['Phenanthren', 0, 'c1ccc2c(c1)ccc1ccccc12', { iupac: 'Phenanthren' }],
  ['Pyren', 0, 'c1cc2ccc3cccc4ccc(c1)c2c34', { iupac: 'Pyren' }],
  ['Cyclooctatetraen', 0, 'C1=CC=CC=CC=C1'],
  // Halogenverbindungen
  ['Chlormethan', 1, 'CCl', { alias: 'Methylchlorid' }],
  ['Dichlormethan', 1, 'ClCCl', { alias: 'Methylenchlorid, DCM' }],
  ['Chloroform', 1, 'ClC(Cl)Cl', { alias: 'Trichlormethan' }],
  ['Tetrachlorkohlenstoff', 1, 'ClC(Cl)(Cl)Cl', { alias: 'Tetrachlormethan, CCl4' }],
  ['Chlorethan', 1, 'CCCl', { alias: 'Ethylchlorid' }],
  ['Vinylchlorid', 1, 'C=CCl', { alias: 'Chlorethen' }],
  ['Tetrafluorethen', 1, 'FC(F)=C(F)F', { alias: 'TFE, Teflon-Monomer' }],
  ['Chlorbenzol', 1, 'Clc1ccccc1'],
  ['Brombenzol', 1, 'Brc1ccccc1'],
  ['Halothan', 1, 'FC(F)(F)C(Cl)Br'],
  ['Freon 12', 1, 'FC(F)(Cl)Cl', { alias: 'Dichlordifluormethan, FCKW' }],
  ['DDT', 1, 'ClC(Cl)(Cl)C(c1ccc(Cl)cc1)c1ccc(Cl)cc1'],
  // Alkohole & Ether
  ['Methanol', 2, 'CO', { alias: 'Holzgeist' }],
  ['Ethanol', 2, 'CCO', { alias: 'Alkohol, Weingeist' }],
  ['Propan-1-ol', 2, 'CCCO', { alias: 'n-Propanol' }],
  ['Isopropanol', 2, 'CC(C)O', { alias: 'Propan-2-ol' }],
  ['Butan-1-ol', 2, 'CCCCO', { alias: 'n-Butanol' }],
  ['Butan-2-ol', 2, 'CCC(C)O'],
  ['tert-Butanol', 2, 'CC(C)(C)O'],
  ['Ethylenglykol', 2, 'OCCO', { alias: 'Glykol, Ethandiol' }],
  ['Glycerin', 2, 'OCC(O)CO', { alias: 'Glycerol, Propantriol' }],
  ['Cyclohexanol', 2, 'OC1CCCCC1'],
  ['Benzylalkohol', 2, 'OCc1ccccc1'],
  ['Phenol', 2, 'Oc1ccccc1', { alias: 'Carbolsäure' }],
  ['Brenzcatechin', 2, 'Oc1ccccc1O', { alias: 'Catechol' }],
  ['Resorcin', 2, 'Oc1cccc(O)c1'],
  ['Hydrochinon', 2, 'Oc1ccc(O)cc1'],
  ['Thymol', 2, 'Cc1ccc(C(C)C)c(O)c1'],
  ['Dimethylether', 2, 'COC'],
  ['Diethylether', 2, 'CCOCC', { alias: 'Ether' }],
  ['MTBE', 2, 'COC(C)(C)C', { alias: 'Methyl-tert-butylether' }],
  ['Anisol', 2, 'COc1ccccc1'],
  ['THF', 2, 'C1CCOC1', { alias: 'Tetrahydrofuran', iupac: 'Oxolan' }],
  ['1,4-Dioxan', 2, 'C1COCCO1', { iupac: '1,4-Dioxan' }],
  ['Ethylenoxid', 2, 'C1CO1', { iupac: 'Oxiran' }],
  // Carbonylverbindungen
  ['Formaldehyd', 3, 'C=O', { alias: 'Methanal' }],
  ['Acetaldehyd', 3, 'CC=O', { alias: 'Ethanal' }],
  ['Propanal', 3, 'CCC=O', { alias: 'Propionaldehyd' }],
  ['Aceton', 3, 'CC(C)=O', { alias: 'Propanon, Dimethylketon' }],
  ['Butanon', 3, 'CCC(C)=O', { alias: 'Methylethylketon, MEK' }],
  ['Cyclohexanon', 3, 'O=C1CCCCC1'],
  ['Acrolein', 3, 'C=CC=O', { alias: 'Propenal' }],
  ['Benzaldehyd', 3, 'O=Cc1ccccc1', { alias: 'Bittermandelöl' }],
  ['Acetophenon', 3, 'CC(=O)c1ccccc1'],
  ['Benzophenon', 3, 'O=C(c1ccccc1)c1ccccc1'],
  ['Zimtaldehyd', 3, 'O=C/C=C/c1ccccc1'],
  ['Vanillin', 3, 'COc1cc(C=O)ccc1O'],
  ['Citral (Geranial)', 3, 'CC(C)=CCC/C(C)=C/C=O', { alias: 'Zitronenduft' }],
  ['Acetylaceton', 3, 'CC(=O)CC(C)=O'],
  ['p-Benzochinon', 3, 'O=C1C=CC(=O)C=C1', { alias: 'Chinon' }],
  // Säuren & Derivate
  ['Ameisensäure', 4, 'OC=O', { alias: 'Methansäure' }],
  ['Essigsäure', 4, 'CC(=O)O', { alias: 'Ethansäure' }],
  ['Propionsäure', 4, 'CCC(=O)O', { alias: 'Propansäure' }],
  ['Buttersäure', 4, 'CCCC(=O)O', { alias: 'Butansäure' }],
  ['Valeriansäure', 4, 'CCCCC(=O)O', { alias: 'Pentansäure' }],
  ['Palmitinsäure', 4, 'CCCCCCCCCCCCCCCC(=O)O', { alias: 'Hexadecansäure, Fettsäure' }],
  ['Stearinsäure', 4, 'CCCCCCCCCCCCCCCCCC(=O)O', { alias: 'Octadecansäure, Fettsäure' }],
  ['Ölsäure', 4, 'CCCCCCCC/C=C\\CCCCCCCC(=O)O', { alias: 'Fettsäure, Omega-9' }],
  ['Linolsäure', 4, 'CCCCC/C=C\\C/C=C\\CCCCCCCC(=O)O', { alias: 'Fettsäure, Omega-6' }],
  ['Acrylsäure', 4, 'C=CC(=O)O', { alias: 'Propensäure' }],
  ['Oxalsäure', 4, 'OC(=O)C(=O)O', { alias: 'Ethandisäure, Kleesäure' }],
  ['Malonsäure', 4, 'OC(=O)CC(=O)O', { alias: 'Propandisäure' }],
  ['Bernsteinsäure', 4, 'OC(=O)CCC(=O)O', { alias: 'Butandisäure' }],
  ['Adipinsäure', 4, 'OC(=O)CCCCC(=O)O', { alias: 'Hexandisäure, Nylon' }],
  ['Fumarsäure', 4, 'OC(=O)/C=C/C(=O)O'],
  ['Maleinsäure', 4, 'OC(=O)/C=C\\C(=O)O'],
  ['Milchsäure', 4, 'C[C@@H](C(=O)O)O', { pre: 'L-', base: 'Milchsäure', alias: '2-Hydroxypropansäure' }],
  ['Brenztraubensäure', 4, 'CC(=O)C(=O)O', { alias: 'Pyruvat' }],
  ['Glycolsäure', 4, 'OCC(=O)O'],
  ['Weinsäure', 4, '[C@@H]([C@H](C(=O)O)O)(C(=O)O)O', { pre: 'L-', base: 'Weinsäure' }],
  ['Äpfelsäure', 4, 'C([C@@H](C(=O)O)O)C(=O)O', { pre: 'L-', base: 'Äpfelsäure' }],
  ['Citronensäure', 4, 'OC(=O)CC(O)(CC(=O)O)C(=O)O', { alias: 'Zitronensäure' }],
  ['Ascorbinsäure', 4, 'C([C@@H]([C@@H]1C(=C(C(=O)O1)O)O)O)O', { pre: 'L-', base: 'Ascorbinsäure', alias: 'Vitamin C', iupac: '(5R)-5-[(1S)-1,2-Dihydroxyethyl]-3,4-dihydroxyfuran-2(5H)-on' }],
  ['Benzoesäure', 4, 'OC(=O)c1ccccc1'],
  ['Salicylsäure', 4, 'OC(=O)c1ccccc1O'],
  ['Phthalsäure', 4, 'OC(=O)c1ccccc1C(=O)O'],
  ['Terephthalsäure', 4, 'OC(=O)c1ccc(cc1)C(=O)O', { alias: 'PET' }],
  ['Zimtsäure', 4, 'OC(=O)/C=C/c1ccccc1'],
  ['Gallussäure', 4, 'OC(=O)c1cc(O)c(O)c(O)c1'],
  ['Methylacetat', 4, 'COC(C)=O', { alias: 'Essigsäuremethylester' }],
  ['Ethylacetat', 4, 'CCOC(C)=O', { alias: 'Essigsäureethylester, Essigester' }],
  ['Essigsäureanhydrid', 4, 'CC(=O)OC(C)=O', { iupac: 'Ethansäureanhydrid' }],
  ['Acetylchlorid', 4, 'CC(Cl)=O'],
  ['Acetamid', 4, 'CC(N)=O'],
  ['Harnstoff', 4, 'NC(N)=O', { alias: 'Urea, Carbamid', iupac: 'Harnstoff (Carbonyldiamid)' }],
  ['Kohlensäure', 4, 'OC(=O)O', { iupac: 'Kohlensäure' }],
  ['Phosgen', 4, 'ClC(Cl)=O', { iupac: 'Carbonyldichlorid' }],
  ['Methylmethacrylat', 4, 'C=C(C)C(=O)OC', { alias: 'MMA, Plexiglas' }],
  // Stickstoffverbindungen
  ['Methylamin', 5, 'CN'],
  ['Dimethylamin', 5, 'CNC'],
  ['Trimethylamin', 5, 'CN(C)C', { alias: 'Fischgeruch' }],
  ['Ethylamin', 5, 'CCN'],
  ['Diethylamin', 5, 'CCNCC'],
  ['Triethylamin', 5, 'CCN(CC)CC'],
  ['Ethylendiamin', 5, 'NCCN'],
  ['Hexamethylendiamin', 5, 'NCCCCCCN', { alias: 'Nylon' }],
  ['Anilin', 5, 'Nc1ccccc1', { alias: 'Aminobenzol' }],
  ['Acetonitril', 5, 'CC#N'],
  ['Acrylnitril', 5, 'C=CC#N'],
  ['Benzonitril', 5, 'N#Cc1ccccc1'],
  ['Nitromethan', 5, 'C[N+](=O)[O-]'],
  ['Nitrobenzol', 5, '[O-][N+](=O)c1ccccc1'],
  ['TNT', 5, 'Cc1c(cc(cc1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]', { alias: 'Trinitrotoluol' }],
  ['Pikrinsäure', 5, 'Oc1c(cc(cc1[N+](=O)[O-])[N+](=O)[O-])[N+](=O)[O-]', { alias: 'Trinitrophenol' }],
  ['Nitroglycerin', 5, 'C(C(CO[N+](=O)[O-])O[N+](=O)[O-])O[N+](=O)[O-]', { alias: 'Glycerintrinitrat', iupac: 'Propan-1,2,3-triyltrinitrat' }],
  ['Azobenzol', 5, 'c1ccc(cc1)/N=N/c1ccccc1', { iupac: '(E)-Diphenyldiazen' }],
  ['DMF', 5, 'CN(C)C=O', { alias: 'Dimethylformamid' }],
  ['DMSO', 5, 'CS(C)=O', { alias: 'Dimethylsulfoxid', iupac: '(Methansulfinyl)methan' }],
  ['Hydrazin', 5, 'NN'],
  // Heterocyclen
  ['Pyridin', 6, 'c1ccncc1', { iupac: 'Pyridin' }],
  ['Pyrrol', 6, 'c1cc[nH]c1', { iupac: '1H-Pyrrol' }],
  ['Furan', 6, 'c1ccoc1', { iupac: 'Furan' }],
  ['Thiophen', 6, 'c1ccsc1', { iupac: 'Thiophen' }],
  ['Imidazol', 6, 'c1c[nH]cn1', { iupac: '1H-Imidazol' }],
  ['Pyrazol', 6, 'c1cn[nH]c1', { iupac: '1H-Pyrazol' }],
  ['Pyrimidin', 6, 'c1cncnc1', { iupac: 'Pyrimidin' }],
  ['Pyrazin', 6, 'c1cnccn1', { iupac: 'Pyrazin' }],
  ['Piperidin', 6, 'C1CCNCC1', { iupac: 'Piperidin' }],
  ['Pyrrolidin', 6, 'C1CCNC1', { iupac: 'Pyrrolidin' }],
  ['Morpholin', 6, 'C1COCCN1', { iupac: 'Morpholin' }],
  ['Indol', 6, 'c1ccc2[nH]ccc2c1', { iupac: '1H-Indol' }],
  ['Chinolin', 6, 'c1ccc2ncccc2c1', { iupac: 'Chinolin' }],
  ['Purin', 6, 'c1ncc2[nH]cnc2n1', { iupac: '7H-Purin' }],
  ['Caprolactam', 6, 'O=C1CCCCCN1', { iupac: 'Azepan-2-on', alias: 'Nylon 6' }],
  // Aminosäuren (L-Form)
  ['Glycin', 7, 'NCC(=O)O', { alias: 'Gly, G' }],
  ['Alanin', 7, 'C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Ala, A' }],
  ['Valin', 7, 'CC(C)[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Val, V' }],
  ['Leucin', 7, 'CC(C)C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Leu, L' }],
  ['Isoleucin', 7, 'CC[C@H](C)[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Ile, I' }],
  ['Prolin', 7, 'C1C[C@H](NC1)C(=O)O', { pre: 'L-', alias: 'Pro, P', iupac: '(2S)-Pyrrolidin-2-carbonsäure' }],
  ['Phenylalanin', 7, 'C1=CC=C(C=C1)C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Phe, F' }],
  ['Tryptophan', 7, 'C1=CC=C2C(=C1)C(=CN2)C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Trp, W', iupac: '(2S)-2-Amino-3-(1H-indol-3-yl)propansäure' }],
  ['Methionin', 7, 'CSCC[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Met, M' }],
  ['Serin', 7, 'C([C@@H](C(=O)O)N)O', { pre: 'L-', alias: 'Ser, S' }],
  ['Threonin', 7, 'C[C@H]([C@@H](C(=O)O)N)O', { pre: 'L-', alias: 'Thr, T' }],
  ['Cystein', 7, 'C([C@@H](C(=O)O)N)S', { pre: 'L-', alias: 'Cys, C' }],
  ['Tyrosin', 7, 'C1=CC(=CC=C1C[C@@H](C(=O)O)N)O', { pre: 'L-', alias: 'Tyr, Y' }],
  ['Asparagin', 7, 'C([C@@H](C(=O)O)N)C(=O)N', { pre: 'L-', alias: 'Asn, N' }],
  ['Glutamin', 7, 'C(CC(=O)N)[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Gln, Q' }],
  ['Asparaginsäure', 7, 'C([C@@H](C(=O)O)N)C(=O)O', { pre: 'L-', alias: 'Asp, D, Aspartat' }],
  ['Glutaminsäure', 7, 'C(CC(=O)O)[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Glu, E, Glutamat' }],
  ['Lysin', 7, 'C(CCN)C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'Lys, K' }],
  ['Arginin', 7, 'C(C[C@@H](C(=O)O)N)CN=C(N)N', { pre: 'L-', alias: 'Arg, R' }],
  ['Histidin', 7, 'C1=C(NC=N1)C[C@@H](C(=O)O)N', { pre: 'L-', alias: 'His, H' }],
  // Kohlenhydrate
  ['Glycerinaldehyd', 8, 'C([C@H](C=O)O)O', { pre: 'D-' }],
  ['Dihydroxyaceton', 8, 'OCC(=O)CO'],
  ['Glucose (offenkettig)', 8, 'C([C@H]([C@H]([C@@H]([C@H](C=O)O)O)O)O)O', { pre: 'D-', base: 'Glucose (offenkettig)', alias: 'Traubenzucker, Dextrose' }],
  ['β-D-Glucose', 8, 'C([C@@H]1[C@H]([C@@H]([C@H]([C@@H](O1)O)O)O)O)O', { base: 'Glucopyranose', alias: 'Traubenzucker, Glucopyranose', iupac: '(2R,3R,4S,5S,6R)-6-(Hydroxymethyl)oxan-2,3,4,5-tetrol' }],
  ['α-D-Glucose', 8, 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O)O)O)O)O', { base: 'Glucopyranose', alias: 'Traubenzucker, Glucopyranose', iupac: '(2S,3R,4S,5S,6R)-6-(Hydroxymethyl)oxan-2,3,4,5-tetrol' }],
  ['Fructose (offenkettig)', 8, 'C([C@H]([C@H]([C@@H](C(=O)CO)O)O)O)O', { pre: 'D-', base: 'Fructose (offenkettig)', alias: 'Fruchtzucker' }],
  ['Ribose (offenkettig)', 8, 'C([C@H]([C@H]([C@H](C=O)O)O)O)O', { pre: 'D-', base: 'Ribose (offenkettig)' }],
  ['Galactose (offenkettig)', 8, 'C([C@H]([C@@H]([C@@H]([C@H](C=O)O)O)O)O)O', { pre: 'D-', base: 'Galactose (offenkettig)' }],
  ['Saccharose', 8, 'C([C@@H]1[C@H]([C@@H]([C@H]([C@H](O1)O[C@]2([C@H]([C@@H]([C@H](O2)CO)O)O)CO)O)O)O)O', { alias: 'Haushaltszucker, Rohrzucker', iupac: '(2R,3R,4S,5S,6R)-2-{[(2S,3S,4S,5R)-3,4-Dihydroxy-2,5-bis(hydroxymethyl)oxolan-2-yl]oxy}-6-(hydroxymethyl)oxan-3,4,5-triol' }],
  // Naturstoffe & Biomoleküle
  ['Coffein', 9, 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', { alias: 'Koffein, Tein', iupac: '1,3,7-Trimethyl-3,7-dihydro-1H-purin-2,6-dion' }],
  ['Theobromin', 9, 'CN1C=NC2=C1C(=O)NC(=O)N2C', { alias: 'Kakao', iupac: '3,7-Dimethyl-3,7-dihydro-1H-purin-2,6-dion' }],
  ['Nikotin', 9, 'CN1CCC[C@H]1C2=CN=CC=C2', { pre: '(S)-', iupac: '3-[(2S)-1-Methylpyrrolidin-2-yl]pyridin' }],
  ['Adenin', 9, 'C1=NC2=NC=NC(=C2N1)N', { alias: 'DNA-Base A', iupac: '7H-Purin-6-amin' }],
  ['Guanin', 9, 'C1=NC2=C(N1)C(=O)NC(=N2)N', { alias: 'DNA-Base G', iupac: '2-Amino-1,7-dihydro-6H-purin-6-on' }],
  ['Cytosin', 9, 'NC1=NC(=O)NC=C1', { alias: 'DNA-Base C', iupac: '4-Aminopyrimidin-2(1H)-on' }],
  ['Thymin', 9, 'CC1=CNC(=O)NC1=O', { alias: 'DNA-Base T', iupac: '5-Methylpyrimidin-2,4(1H,3H)-dion' }],
  ['Uracil', 9, 'C1=CNC(=O)NC1=O', { alias: 'RNA-Base U', iupac: 'Pyrimidin-2,4(1H,3H)-dion' }],
  ['Harnsäure', 9, 'C12=C(NC(=O)N1)NC(=O)NC2=O', { iupac: '7,9-Dihydro-1H-purin-2,6,8(3H)-trion' }],
  ['Cholesterin', 9, 'C[C@H](CCCC(C)C)[C@H]1CC[C@@H]2[C@@]1(CC[C@H]3[C@H]2CC=C4[C@@]3(CC[C@@H](C4)O)C)C', { alias: 'Cholesterol, Steroid', iupac: 'Cholest-5-en-3β-ol' }],
  ['Testosteron', 9, 'C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2O)CCC4=CC(=O)CC[C@]34C', { alias: 'Hormon, Steroid', iupac: '17β-Hydroxyandrost-4-en-3-on' }],
  ['Östradiol', 9, 'C[C@]12CC[C@H]3[C@H]([C@@H]1CC[C@@H]2O)CCC4=C3C=CC(=C4)O', { alias: 'Estradiol, Hormon', iupac: 'Estra-1,3,5(10)-trien-3,17β-diol' }],
  ['Menthol', 9, 'C[C@@H]1CC[C@H]([C@@H](C1)O)C(C)C', { pre: '(−)-', alias: 'Pfefferminze' }],
  ['Limonen', 9, 'CC1=CC[C@@H](CC1)C(=C)C', { pre: '(R)-', alias: 'Zitrusduft' }],
  ['Geraniol', 9, 'CC(C)=CCC/C(C)=C/CO', { alias: 'Rosenduft' }],
  ['Eugenol', 9, 'COc1cc(CC=C)ccc1O', { alias: 'Nelkenöl' }],
  ['Capsaicin', 9, 'COc1cc(CNC(=O)CCCC/C=C/C(C)C)ccc1O', { alias: 'Chili, Scharfstoff' }],
  ['Retinol', 9, 'CC1=C(C(CCC1)(C)C)/C=C/C(=C/C=C/C(=C/CO)/C)/C', { alias: 'Vitamin A' }],
  ['Dopamin', 9, 'NCCc1ccc(O)c(O)c1', { alias: 'Neurotransmitter' }],
  ['Adrenalin', 9, 'CNC[C@@H](C1=CC(=C(C=C1)O)O)O', { pre: '(R)-', alias: 'Epinephrin, Hormon' }],
  ['Noradrenalin', 9, 'C1=CC(=C(C=C1[C@H](CN)O)O)O', { pre: '(R)-', alias: 'Norepinephrin' }],
  ['Serotonin', 9, 'NCCc1c[nH]c2ccc(O)cc12', { alias: 'Glückshormon', iupac: '3-(2-Aminoethyl)-1H-indol-5-ol' }],
  ['Histamin', 9, 'NCCc1c[nH]cn1', { iupac: '2-(1H-Imidazol-4-yl)ethan-1-amin' }],
  ['Melatonin', 9, 'CC(=O)NCCc1c[nH]c2ccc(OC)cc12', { iupac: 'N-[2-(5-Methoxy-1H-indol-3-yl)ethyl]acetamid' }],
  ['Acetylcholin', 9, 'CC(=O)OCC[N+](C)(C)C', { alias: 'Neurotransmitter' }],
  ['GABA', 9, 'NCCCC(=O)O', { alias: 'γ-Aminobuttersäure' }],
  // Arzneistoffe
  ['Aspirin', 10, 'CC(=O)Oc1ccccc1C(=O)O', { alias: 'Acetylsalicylsäure, ASS' }],
  ['Paracetamol', 10, 'CC(=O)Nc1ccc(O)cc1', { alias: 'Acetaminophen' }],
  ['Ibuprofen', 10, 'CC(C)Cc1ccc(cc1)C(C)C(=O)O'],
  ['Naproxen', 10, 'C[C@@H](C1=CC2=C(C=C1)C=C(C=C2)OC)C(=O)O', { pre: '(S)-', iupac: '(2S)-2-(6-Methoxynaphthalin-2-yl)propansäure' }],
  ['Diclofenac', 10, 'OC(=O)Cc1ccccc1Nc1c(Cl)cccc1Cl'],
  ['Penicillin G', 10, 'CC1([C@@H](N2[C@H](S1)[C@@H](C2=O)NC(=O)CC3=CC=CC=C3)C(=O)O)C', { alias: 'Benzylpenicillin, Antibiotikum', iupac: '(2S,5R,6R)-3,3-Dimethyl-7-oxo-6-[(phenylacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptan-2-carbonsäure' }],
  ['Lidocain', 10, 'CCN(CC)CC(=O)Nc1c(C)cccc1C', { alias: 'Lokalanästhetikum' }],
  ['Benzocain', 10, 'CCOC(=O)c1ccc(N)cc1', { alias: 'Lokalanästhetikum' }],
  ['Procain', 10, 'CCN(CC)CCOC(=O)c1ccc(N)cc1', { alias: 'Novocain' }],
  ['Diazepam', 10, 'CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc12', { alias: 'Valium', iupac: '7-Chlor-1-methyl-5-phenyl-1,3-dihydro-2H-1,4-benzodiazepin-2-on' }],
  ['Thalidomid', 10, 'O=C1CCC(N2C(=O)c3ccccc3C2=O)C(=O)N1', { alias: 'Contergan', iupac: '2-(2,6-Dioxopiperidin-3-yl)isoindol-1,3-dion' }],
  ['Amphetamin', 10, 'CC(N)Cc1ccccc1'],
  ['Salbutamol', 10, 'CC(C)(C)NCC(O)c1ccc(O)c(CO)c1', { alias: 'Asthmaspray' }],
  ['Metformin', 10, 'CN(C)C(=N)N=C(N)N', { iupac: '3-(Diaminomethyliden)-1,1-dimethylguanidin' }],
  // Farbstoffe & Indikatoren
  ['Phenolphthalein', 11, 'O=C1OC(c2ccccc12)(c1ccc(O)cc1)c1ccc(O)cc1', { alias: 'Indikator', iupac: '3,3-Bis(4-hydroxyphenyl)-2-benzofuran-1(3H)-on' }],
  ['Methylorange', 11, 'CN(C)c1ccc(cc1)/N=N/c1ccc(cc1)S(=O)(=O)[O-].[Na+]', { alias: 'Indikator', iupac: 'Natrium-4-{[4-(dimethylamino)phenyl]diazenyl}benzolsulfonat' }],
  ['Indigo', 11, 'O=C1/C(Nc2ccccc12)=C1\\Nc2ccccc2C1=O', { alias: 'Jeansblau' }],
  ['Alizarin', 11, 'O=C1c2ccccc2C(=O)c2c1ccc(O)c2O', { iupac: '1,2-Dihydroxyanthracen-9,10-dion' }],
  ['Bisphenol A', 11, 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1', { alias: 'BPA, Kunststoff' }],
  // Anorganisch & Ionen
  ['Wasser', 12, 'O', { alias: 'H2O' }],
  ['Ammoniak', 12, 'N'],
  ['Kohlenstoffdioxid', 12, 'O=C=O', { alias: 'Kohlendioxid, CO2', iupac: 'Kohlenstoffdioxid' }],
  ['Kohlenstoffmonoxid', 12, '[C-]#[O+]', { alias: 'Kohlenmonoxid, CO', iupac: 'Kohlenstoffmonoxid' }],
  ['Schwefelsäure', 12, 'OS(=O)(=O)O'],
  ['Salpetersäure', 12, 'O[N+](=O)[O-]'],
  ['Phosphorsäure', 12, 'OP(=O)(O)O'],
  ['Wasserstoffperoxid', 12, 'OO'],
  ['Blausäure', 12, 'C#N', { alias: 'Cyanwasserstoff', iupac: 'Formonitril' }],
  ['Schwefelwasserstoff', 12, 'S'],
  ['Chlorwasserstoff', 12, 'Cl', { alias: 'Salzsäure' }],
  ['Natriumchlorid', 12, '[Na+].[Cl-]', { alias: 'Kochsalz' }],
  ['Natriumhydroxid', 12, '[Na+].[OH-]', { alias: 'Natronlauge' }],
  ['Ammoniumchlorid', 12, '[NH4+].[Cl-]', { alias: 'Salmiak' }],
  ['Natriumacetat', 12, 'CC(=O)[O-].[Na+]'],
  // seit 1.53: weitere Aminosäuren und Derivate (Schutzgruppen), Peptid- und Oligonukleotid-Synthese, Nukleoside/-tide
  ['β-Alanin', 7, 'NCCC(=O)O', { iupac: '3-Aminopropansäure' }],
  ['Sarcosin', 7, 'CNCC(=O)O', { alias: 'N-Methylglycin' }],
  ['Ornithin', 7, 'NCCC[C@H](N)C(=O)O', { pre: 'L-', alias: 'Orn' }],
  ['Citrullin', 7, 'NC(=O)NCCC[C@H](N)C(=O)O', { pre: 'L-', alias: 'Cit' }],
  ['Hydroxyprolin', 7, 'O[C@@H]1C[C@H](NC1)C(=O)O', { pre: 'trans-4-', alias: 'Hyp' }],
  ['Selenocystein', 7, 'N[C@@H](C[SeH])C(=O)O', { pre: 'L-', alias: 'Sec, U' }],
  ['Taurin', 7, 'NCCS(=O)(=O)O', { iupac: '2-Aminoethansulfonsäure' }],
  ['Glycylglycin', 7, 'NCC(=O)NCC(=O)O', { alias: 'Gly-Gly, Dipeptid' }],
  ['Glutathion', 7, 'N[C@@H](CCC(=O)N[C@@H](CS)C(=O)NCC(=O)O)C(=O)O', { alias: 'GSH, γ-Glu-Cys-Gly, Tripeptid' }],
  ['Aspartam', 7, 'COC(=O)[C@H](CC1=CC=CC=C1)NC(=O)[C@@H](N)CC(=O)O', { alias: 'Süssstoff, Asp-Phe-OMe' }],
  ['Glycinmethylester', 7, 'COC(=O)CN', { alias: 'H-Gly-OMe' }],
  ['Boc-Glycin', 7, 'CC(C)(C)OC(=O)NCC(=O)O', { alias: 'Boc-Gly-OH, Schutzgruppe' }],
  ['Boc-Alanin', 7, 'C[C@@H](C(=O)O)NC(=O)OC(C)(C)C', { pre: 'L-', alias: 'Boc-Ala-OH, Schutzgruppe' }],
  ['Fmoc-Glycin', 7, 'O=C(O)CNC(=O)OCC1C2=CC=CC=C2C3=CC=CC=C13', { alias: 'Fmoc-Gly-OH, Schutzgruppe' }],
  ['Fmoc-Alanin', 7, 'C[C@@H](C(=O)O)NC(=O)OCC1C2=CC=CC=C2C3=CC=CC=C13', { pre: 'L-', alias: 'Fmoc-Ala-OH, Schutzgruppe' }],
  ['Z-Glycin', 7, 'O=C(O)CNC(=O)OCC1=CC=CC=C1', { alias: 'Cbz-Gly-OH, Benzyloxycarbonylglycin, Schutzgruppe' }],
  ['Acetylglycin', 7, 'CC(=O)NCC(=O)O', { alias: 'Ac-Gly-OH' }],
  // Peptid- und Oligonukleotid-Synthese
  ['DCC', 13, 'C1CCC(CC1)N=C=NC2CCCCC2', { alias: 'Dicyclohexylcarbodiimid, N,N′-Dicyclohexylcarbodiimid, Carbodiimid' }],
  ['DCU', 13, 'O=C(NC1CCCCC1)NC1CCCCC1', { alias: 'Dicyclohexylharnstoff, 1,3-Dicyclohexylharnstoff, Harnstoff aus DCC' }],
  ['DIC', 13, 'CC(C)N=C=NC(C)C', { alias: 'Diisopropylcarbodiimid, N,N′-Diisopropylcarbodiimid, Carbodiimid' }],
  ['DIU', 13, 'CC(C)NC(=O)NC(C)C', { alias: 'Diisopropylharnstoff, 1,3-Diisopropylharnstoff, Harnstoff aus DIC' }],
  ['EDC', 13, 'CCN=C=NCCCN(C)C', { alias: 'EDCI, EDAC, 1-Ethyl-3-(3-dimethylaminopropyl)carbodiimid, Carbodiimid, wasserlöslich' }],
  ['EDC-Hydrochlorid', 13, 'CCN=C=NCCC[NH+](C)C.[Cl-]', { alias: 'EDC·HCl, EDCI·HCl, Carbodiimid' }],
  ['EDU', 13, 'CCNC(=O)NCCCN(C)C', { alias: 'Harnstoff aus EDC, 1-Ethyl-3-(3-dimethylaminopropyl)harnstoff' }],
  ['CDI', 13, 'O=C(N1C=CN=C1)N1C=CN=C1', { alias: 'Carbonyldiimidazol, 1,1′-Carbonyldiimidazol' }],
  ['HOBt', 13, 'ON1N=NC2=CC=CC=C21', { alias: '1-Hydroxybenzotriazol, Kupplungszusatz' }],
  ['HOAt', 13, 'ON1N=NC2=CC=CN=C21', { alias: '1-Hydroxy-7-azabenzotriazol, Kupplungszusatz' }],
  ['Oxyma', 13, 'CCOC(=O)C(=NO)C#N', { alias: 'Oxyma Pure, Ethylcyano(hydroxyimino)acetat, Kupplungszusatz' }],
  ['NHS', 13, 'ON1C(=O)CCC1=O', { alias: 'N-Hydroxysuccinimid, HOSu' }],
  ['HBTU', 13, 'CN(C)C(=[N+](C)C)ON1N=NC2=CC=CC=C21.F[P-](F)(F)(F)(F)F', { alias: 'Kupplungsreagenz, Uronium-Salz' }],
  ['TBTU', 13, 'CN(C)C(=[N+](C)C)ON1N=NC2=CC=CC=C21.F[B-](F)(F)F', { alias: 'Kupplungsreagenz, Uronium-Salz' }],
  ['HATU', 13, 'CN(C)C(=[N+](C)C)ON1N=NC2=CC=CN=C21.F[P-](F)(F)(F)(F)F', { alias: 'Kupplungsreagenz, Uronium-Salz' }],
  ['PyBOP', 13, 'C1CCN(C1)[P+](N2CCCC2)(N3CCCC3)ON4N=NC5=CC=CC=C54.F[P-](F)(F)(F)(F)F', { alias: 'Kupplungsreagenz, Phosphonium-Salz' }],
  ['Tetramethylharnstoff', 13, 'CN(C)C(=O)N(C)C', { alias: 'TMU, Harnstoff aus HBTU/HATU/TBTU' }],
  ['DMAP', 13, 'CN(C)C1=CC=NC=C1', { alias: '4-Dimethylaminopyridin, 4-(Dimethylamino)pyridin, Katalysator' }],
  ['DIPEA', 13, 'CCN(C(C)C)C(C)C', { alias: 'Hünig-Base, N,N-Diisopropylethylamin, DIEA' }],
  ['NMM', 13, 'CN1CCOCC1', { alias: 'N-Methylmorpholin, 4-Methylmorpholin' }],
  ['NMP', 13, 'CN1CCCC1=O', { alias: 'N-Methyl-2-pyrrolidon, 1-Methyl-2-pyrrolidon, Lösungsmittel' }],
  ['Trifluoressigsäure', 13, 'OC(=O)C(F)(F)F', { alias: 'TFA, Abspaltung, Boc-Entschützung' }],
  ['Dichloressigsäure', 13, 'OC(=O)C(Cl)Cl', { alias: 'DCA, Detritylierung, Oligosynthese' }],
  ['Trichloressigsäure', 13, 'OC(=O)C(Cl)(Cl)Cl', { alias: 'TCA, Detritylierung' }],
  ['Triisopropylsilan', 13, 'CC(C)[SiH](C(C)C)C(C)C', { alias: 'TIS, TIPS, Fänger (Scavenger)' }],
  ['1,2-Ethandithiol', 13, 'SCCS', { alias: 'EDT, Fänger (Scavenger)' }],
  ['Fmoc-Chlorid', 13, 'ClC(=O)OCC1C2=CC=CC=C2C3=CC=CC=C13', { alias: 'Fmoc-Cl, 9-Fluorenylmethoxycarbonylchlorid, Schutzgruppe' }],
  ['Di-tert-butyldicarbonat', 13, 'CC(C)(C)OC(=O)OC(=O)OC(C)(C)C', { alias: 'Boc2O, Boc-Anhydrid, Schutzgruppe' }],
  ['DMT-Chlorid', 13, 'COC1=CC=C(C=C1)C(Cl)(C2=CC=CC=C2)C3=CC=C(C=C3)OC', { alias: 'DMTr-Cl, 4,4′-Dimethoxytritylchlorid, Schutzgruppe, Oligosynthese' }],
  ['Chlorphosphoramidit', 13, 'ClP(OCCC#N)N(C(C)C)C(C)C', { alias: '2-Cyanoethyl-N,N-diisopropylchlorphosphoramidit, CEP-Cl, Oligosynthese' }],
  ['Tetrazol', 13, 'C1=NN=NN1', { alias: '1H-Tetrazol, Aktivator, Oligosynthese' }],
  ['ETT', 13, 'CCSC1=NN=NN1', { alias: '5-Ethylthio-1H-tetrazol, Aktivator, Oligosynthese' }],
  // Nukleoside, Nukleotide, Oligonukleotid-Bausteine
  ['Adenosin', 14, 'C1=NC(=C2C(=N1)N(C=N2)[C@H]3[C@@H]([C@@H]([C@H](O3)CO)O)O)N', { alias: 'A, Ribonukleosid' }],
  ['Guanosin', 14, 'C1=NC2=C(N1[C@H]3[C@@H]([C@@H]([C@H](O3)CO)O)O)N=C(NC2=O)N', { alias: 'G, Ribonukleosid' }],
  ['Cytidin', 14, 'C1=CN(C(=O)N=C1N)[C@H]2[C@@H]([C@@H]([C@H](O2)CO)O)O', { alias: 'C, Ribonukleosid' }],
  ['Uridin', 14, 'C1=CN(C(=O)NC1=O)[C@H]2[C@@H]([C@@H]([C@H](O2)CO)O)O', { alias: 'U, Ribonukleosid' }],
  ['Inosin', 14, 'C1=NC2=C(C(=O)N1)N=CN2[C@H]3[C@@H]([C@@H]([C@H](O3)CO)O)O', { alias: 'I, Ribonukleosid' }],
  ['2′-Desoxyadenosin', 14, 'C1[C@@H]([C@H](O[C@H]1N2C=NC3=C(N=CN=C32)N)CO)O', { alias: 'dA, Desoxyribonukleosid, DNA' }],
  ['2′-Desoxyguanosin', 14, 'C1[C@@H]([C@H](O[C@H]1N2C=NC3=C2N=C(NC3=O)N)CO)O', { alias: 'dG, Desoxyribonukleosid, DNA' }],
  ['2′-Desoxycytidin', 14, 'C1[C@@H]([C@H](O[C@H]1N2C=CC(=NC2=O)N)CO)O', { alias: 'dC, Desoxyribonukleosid, DNA' }],
  ['Thymidin', 14, 'CC1=CN(C(=O)NC1=O)[C@H]2C[C@@H]([C@H](O2)CO)O', { alias: 'dT, Desoxythymidin, DNA' }],
  ['AMP', 14, 'C1=NC(=C2C(=N1)N(C=N2)[C@H]3[C@@H]([C@@H]([C@H](O3)COP(=O)(O)O)O)O)N', { alias: 'Adenosinmonophosphat, Nukleotid' }],
  ['ATP', 14, 'C1=NC(=C2C(=N1)N(C=N2)[C@H]3[C@@H]([C@@H]([C@H](O3)COP(=O)(O)OP(=O)(O)OP(=O)(O)O)O)O)N', { alias: 'Adenosintriphosphat, Energieträger, Nukleotid' }],
  ['cAMP', 14, 'C1[C@@H]2[C@H]([C@H]([C@@H](O2)N3C=NC4=C(N=CN=C43)N)O)OP(=O)(O1)O', { alias: 'zyklisches AMP, Botenstoff' }],
  ['dTMP', 14, 'CC1=CN(C(=O)NC1=O)[C@H]2C[C@@H]([C@H](O2)COP(=O)(O)O)O', { alias: 'Thymidinmonophosphat, Nukleotid, DNA' }],
  ['d(TpT)', 14, 'CC1=CN(C(=O)NC1=O)[C@H]2C[C@@H]([C@H](O2)CO)OP(=O)(O)OC[C@@H]3[C@H](C[C@@H](O3)N4C=C(C)C(=O)NC4=O)O', { alias: 'Thymidylyl-(3′→5′)-thymidin, Dinukleotid, Oligonukleotid, DNA' }],
  ['5′-DMT-Thymidin', 14, 'CC1=CN(C(=O)NC1=O)[C@H]2C[C@@H]([C@H](O2)COC(C1=CC=CC=C1)(C2=CC=C(C=C2)OC)C3=CC=C(C=C3)OC)O', { alias: 'DMT-dT, Oligosynthese' }],
  ['DMT-dT-Phosphoramidit', 14, 'CC1=CN(C(=O)NC1=O)[C@H]2C[C@@H]([C@H](O2)COC(C1=CC=CC=C1)(C2=CC=C(C=C2)OC)C3=CC=C(C=C3)OC)OP(N(C(C)C)C(C)C)OCCC#N', { alias: 'dT-CE-Phosphoramidit, Baustein, Oligosynthese' }],
  ['N6-Benzoyl-2′-desoxyadenosin', 14, 'C1[C@@H]([C@H](O[C@H]1N2C=NC3=C(N=CN=C32)NC(=O)C4=CC=CC=C4)CO)O', { alias: 'Bz-dA, Schutzgruppe, Oligosynthese' }],
  ['2′-O-Methyluridin', 14, 'CO[C@@H]1[C@H](O)[C@@H](CO)O[C@H]1N1C=CC(=O)NC1=O', { alias: 'Um, RNA-Modifikation, Oligonukleotid' }],
  ['5-Methylcytosin', 14, 'CC1=CNC(=O)N=C1N', { alias: 'DNA-Methylierung, Epigenetik' }],
  // ---- 1.55: Erweiterung (Lösungsmittel, Reagenzien, Naturstoffe, Arzneistoffe, Farbstoffe, Anorganika)
  // Kohlenwasserstoffe
  ['Nonan', 0, 'CCCCCCCCC'],
  ['Decan', 0, 'CCCCCCCCCC'],
  ['Cyclobutan', 0, 'C1CCC1'],
  ['Cycloheptan', 0, 'C1CCCCCC1'],
  ['Cyclooctan', 0, 'C1CCCCCCC1'],
  ['Norbornan', 0, 'C1CC2CCC1C2', { alias: 'Bicyclo[2.2.1]heptan' }],
  ['Adamantan', 0, 'C1C2CC3CC1CC(C2)C3'],
  ['Decalin', 0, 'C1CCC2CCCCC2C1', { alias: 'Decahydronaphthalin' }],
  ['Mesitylen', 0, 'Cc1cc(C)cc(C)c1', { alias: '1,3,5-Trimethylbenzol' }],
  ['Inden', 0, 'C1C=Cc2ccccc21'],
  ['Tetralin', 0, 'C1CCc2ccccc2C1', { alias: 'Tetrahydronaphthalin' }],
  ['Stilben', 0, 'C(=Cc1ccccc1)c1ccccc1', { alias: '1,2-Diphenylethen' }],
  ['Diphenylmethan', 0, 'C(c1ccccc1)c1ccccc1'],
  ['Triphenylmethan', 0, 'C(c1ccccc1)(c1ccccc1)c1ccccc1'],
  ['α-Pinen', 0, 'CC1=CCC2CC1C2(C)C', { alias: 'Pinen, Terpentin' }],
  ['Phenylacetylen', 0, 'C#Cc1ccccc1', { alias: 'Ethinylbenzol' }],
  ['Cyclohexa-1,3-dien', 0, 'C1CC=CC=C1'],
  ['Propylbenzol', 0, 'CCCc1ccccc1'],
  ['Hex-1-en', 0, 'C=CCCCC', { alias: '1-Hexen' }],
  ['But-2-en', 0, 'CC=CC', { alias: '2-Buten' }],
  ['Isobuten', 0, 'C=C(C)C', { alias: '2-Methylpropen' }],
  ['Cyclopentadien', 0, 'C1C=CC=C1'],
  ['Hex-1-in', 0, 'C#CCCCC'],
  ['But-2-in', 0, 'CC#CC', { alias: 'Dimethylacetylen' }],
  // Halogenverbindungen
  ['Bromethan', 1, 'CCBr', { alias: 'Ethylbromid' }],
  ['Iodmethan', 1, 'CI', { alias: 'Methyliodid' }],
  ['1-Brombutan', 1, 'CCCCBr', { alias: 'Butylbromid' }],
  ['2-Brompropan', 1, 'CC(C)Br', { alias: 'Isopropylbromid' }],
  ['Benzylchlorid', 1, 'ClCc1ccccc1'],
  ['Benzylbromid', 1, 'BrCc1ccccc1'],
  ['Fluorbenzol', 1, 'Fc1ccccc1'],
  ['Iodbenzol', 1, 'Ic1ccccc1'],
  ['1,2-Dichlorethan', 1, 'ClCCCl'],
  ['Trichlorethen', 1, 'ClC=C(Cl)Cl', { alias: 'Tri' }],
  ['Tetrachlorethen', 1, 'ClC(Cl)=C(Cl)Cl', { alias: 'Per, Perchlorethylen' }],
  ['Allylbromid', 1, 'C=CCBr', { alias: '3-Brompropen' }],
  ['Epichlorhydrin', 1, 'ClCC1CO1'],
  ['Benzotrifluorid', 1, 'FC(F)(F)c1ccccc1', { alias: 'Trifluortoluol' }],
  ['Hexafluorbenzol', 1, 'Fc1c(F)c(F)c(F)c(F)c1F'],
  ['Bromoform', 1, 'BrC(Br)Br'],
  ['Diiodmethan', 1, 'ICI'],
  ['Lindan', 1, 'ClC1C(Cl)C(Cl)C(Cl)C(Cl)C1Cl', { alias: 'γ-Hexachlorcyclohexan' }],
  ['1-Chlorbutan', 1, 'CCCCCl'],
  ['tert-Butylchlorid', 1, 'CC(C)(C)Cl', { alias: '2-Chlor-2-methylpropan' }],
  ['Chlortrifluormethan', 1, 'FC(F)(F)Cl', { alias: 'Freon 13' }],
  // Alkohole & Ether
  ['Allylalkohol', 2, 'C=CCO', { alias: 'Prop-2-en-1-ol' }],
  ['Propargylalkohol', 2, 'C#CCO', { alias: 'Prop-2-in-1-ol' }],
  ['2-Methoxyethanol', 2, 'COCCO', { alias: 'Methylglykol' }],
  ['Diethylenglykol', 2, 'OCCOCCO'],
  ['Propylenglykol', 2, 'CC(O)CO', { alias: 'Propan-1,2-diol' }],
  ['Pentan-1-ol', 2, 'CCCCCO', { alias: 'Amylalkohol' }],
  ['Hexan-1-ol', 2, 'CCCCCCO'],
  ['Octan-1-ol', 2, 'CCCCCCCCO'],
  ['Cyclopentanol', 2, 'OC1CCCC1'],
  ['2-Phenylethanol', 2, 'OCCc1ccccc1', { alias: 'Rosenduft' }],
  ['1,2-Dimethoxyethan', 2, 'COCCOC', { alias: 'DME, Glyme' }],
  ['Diphenylether', 2, 'c1ccc(Oc2ccccc2)cc1'],
  ['2-Methyl-THF', 2, 'CC1CCCO1', { alias: '2-Methyltetrahydrofuran' }],
  ['Tetrahydropyran', 2, 'C1CCOCC1', { alias: 'THP, Oxan' }],
  ['18-Krone-6', 2, 'C1COCCOCCOCCOCCOCCO1', { alias: 'Kronenether' }],
  ['p-Kresol', 2, 'Cc1ccc(O)cc1', { alias: '4-Methylphenol' }],
  ['Guajacol', 2, 'COc1ccccc1O', { alias: '2-Methoxyphenol' }],
  ['Pyrogallol', 2, 'Oc1cccc(O)c1O'],
  ['2-Naphthol', 2, 'Oc1ccc2ccccc2c1', { alias: 'β-Naphthol' }],
  ['BHT', 2, 'Cc1cc(C(C)(C)C)c(O)c(C(C)(C)C)c1', { alias: 'Butylhydroxytoluol' }],
  ['Isobutanol', 2, 'CC(C)CO', { alias: '2-Methylpropan-1-ol' }],
  ['Isoamylalkohol', 2, 'CC(C)CCO', { alias: '3-Methylbutan-1-ol' }],
  ['Dibutylether', 2, 'CCCCOCCCC'],
  ['Diisopropylether', 2, 'CC(C)OC(C)C', { alias: 'DIPE' }],
  ['Benzylmethylether', 2, 'COCc1ccccc1'],
  // Carbonylverbindungen
  ['Butanal', 3, 'CCCC=O', { alias: 'Butyraldehyd' }],
  ['Isobutyraldehyd', 3, 'CC(C)C=O', { alias: '2-Methylpropanal' }],
  ['Pentan-2-on', 3, 'CCCC(C)=O', { alias: 'Methylpropylketon' }],
  ['Pentan-3-on', 3, 'CCC(=O)CC', { alias: 'Diethylketon' }],
  ['Cyclopentanon', 3, 'O=C1CCCC1'],
  ['Methylvinylketon', 3, 'C=CC(C)=O', { alias: 'MVK, But-3-en-2-on' }],
  ['Mesityloxid', 3, 'CC(C)=CC(C)=O'],
  ['Isophoron', 3, 'CC1=CC(=O)CC(C)(C)C1'],
  ['Crotonaldehyd', 3, 'CC=CC=O', { alias: 'But-2-enal' }],
  ['Glyoxal', 3, 'O=CC=O'],
  ['Glutaraldehyd', 3, 'O=CCCCC=O', { alias: 'Pentandial' }],
  ['Furfural', 3, 'O=Cc1ccco1', { alias: 'Furan-2-carbaldehyd' }],
  ['Anisaldehyd', 3, 'COc1ccc(C=O)cc1', { alias: '4-Methoxybenzaldehyd' }],
  ['Salicylaldehyd', 3, 'O=Cc1ccccc1O', { alias: '2-Hydroxybenzaldehyd' }],
  ['Campher', 3, 'CC1(C)C2CCC1(C)C(=O)C2', { alias: 'Kampfer' }],
  ['Diacetyl', 3, 'CC(=O)C(C)=O', { alias: 'Butandion' }],
  ['Methylisobutylketon', 3, 'CC(C)CC(C)=O', { alias: 'MIBK' }],
  ['Benzil', 3, 'O=C(C(=O)c1ccccc1)c1ccccc1'],
  ['Chalkon', 3, 'O=C(C=Cc1ccccc1)c1ccccc1'],
  ['Anthrachinon', 3, 'O=C1c2ccccc2C(=O)c2ccccc12'],
  ['1,4-Naphthochinon', 3, 'O=C1C=CC(=O)c2ccccc12'],
  ['Ninhydrin', 3, 'O=C1c2ccccc2C(=O)C1(O)O'],
  ['Cyclohexenon', 3, 'O=C1CCCC=C1', { alias: 'Cyclohex-2-en-1-on' }],
  ['Propiophenon', 3, 'CCC(=O)c1ccccc1'],
  ['Dibenzylidenaceton', 3, 'O=C(C=Cc1ccccc1)C=Cc1ccccc1', { alias: 'dba' }],
  // Säuren & Derivate
  ['Isobuttersäure', 4, 'CC(C)C(=O)O'],
  ['Capronsäure', 4, 'CCCCCC(=O)O', { alias: 'Hexansäure' }],
  ['Caprylsäure', 4, 'CCCCCCCC(=O)O', { alias: 'Octansäure' }],
  ['Laurinsäure', 4, 'CCCCCCCCCCCC(=O)O', { alias: 'Dodecansäure' }],
  ['Myristinsäure', 4, 'CCCCCCCCCCCCCC(=O)O', { alias: 'Tetradecansäure' }],
  ['Methacrylsäure', 4, 'CC(=C)C(=O)O'],
  ['Crotonsäure', 4, 'CC=CC(=O)O', { alias: 'But-2-ensäure' }],
  ['Sorbinsäure', 4, 'CC=CC=CC(=O)O', { alias: 'E 200' }],
  ['Glutarsäure', 4, 'OC(=O)CCCC(=O)O'],
  ['Sebacinsäure', 4, 'OC(=O)CCCCCCCCC(=O)O', { alias: 'Decandisäure' }],
  ['Itaconsäure', 4, 'C=C(CC(=O)O)C(=O)O'],
  ['Glyoxylsäure', 4, 'O=CC(=O)O'],
  ['Chloressigsäure', 4, 'OC(=O)CCl'],
  ['Bromessigsäure', 4, 'OC(=O)CBr'],
  ['Phenylessigsäure', 4, 'OC(=O)Cc1ccccc1'],
  ['Mandelsäure', 4, 'OC(=O)C(O)c1ccccc1'],
  ['Hippursäure', 4, 'OC(=O)CNC(=O)c1ccccc1', { alias: 'Benzoylglycin' }],
  ['Methylbenzoat', 4, 'COC(=O)c1ccccc1', { alias: 'Benzoesäuremethylester' }],
  ['Ethylbenzoat', 4, 'CCOC(=O)c1ccccc1'],
  ['Methylsalicylat', 4, 'COC(=O)c1ccccc1O', { alias: 'Wintergrünöl' }],
  ['Ethylformiat', 4, 'CCOC=O', { alias: 'Ameisensäureethylester' }],
  ['Butylacetat', 4, 'CCCCOC(C)=O'],
  ['Isoamylacetat', 4, 'CC(C)CCOC(C)=O', { alias: 'Bananenöl' }],
  ['Vinylacetat', 4, 'C=COC(C)=O'],
  ['Ethylacetoacetat', 4, 'CCOC(=O)CC(C)=O', { alias: 'Acetessigester' }],
  ['Diethylmalonat', 4, 'CCOC(=O)CC(=O)OCC', { alias: 'Malonsäurediethylester' }],
  ['Dimethylcarbonat', 4, 'COC(=O)OC', { alias: 'DMC' }],
  ['Ethylencarbonat', 4, 'O=C1OCCO1'],
  ['γ-Butyrolacton', 4, 'O=C1CCCO1', { alias: 'GBL' }],
  ['Benzoylchlorid', 4, 'ClC(=O)c1ccccc1'],
  ['Oxalylchlorid', 4, 'O=C(Cl)C(=O)Cl'],
  ['Maleinsäureanhydrid', 4, 'O=C1C=CC(=O)O1'],
  ['Phthalsäureanhydrid', 4, 'O=C1OC(=O)c2ccccc12'],
  ['Bernsteinsäureanhydrid', 4, 'O=C1CCC(=O)O1'],
  ['Benzamid', 4, 'NC(=O)c1ccccc1'],
  ['N,N-Dimethylacetamid', 4, 'CC(=O)N(C)C', { alias: 'DMA, DMAc' }],
  ['Formamid', 4, 'NC=O'],
  ['Acetanilid', 4, 'CC(=O)Nc1ccccc1', { alias: 'N-Phenylacetamid' }],
  ['Phthalimid', 4, 'O=C1NC(=O)c2ccccc12'],
  ['Succinimid', 4, 'O=C1CCC(=O)N1'],
  ['NBS', 4, 'O=C1CCC(=O)N1Br', { alias: 'N-Bromsuccinimid' }],
  ['Methansulfonsäure', 4, 'CS(=O)(=O)O', { alias: 'MSA' }],
  ['p-Toluolsulfonsäure', 4, 'Cc1ccc(cc1)S(=O)(=O)O', { alias: 'TsOH, PTSA' }],
  ['Methansulfonylchlorid', 4, 'CS(=O)(=O)Cl', { alias: 'MsCl, Mesylchlorid' }],
  ['Tosylchlorid', 4, 'Cc1ccc(cc1)S(=O)(=O)Cl', { alias: 'TsCl' }],
  ['Trifluormethansulfonsäure', 4, 'OS(=O)(=O)C(F)(F)F', { alias: 'Triflic acid, TfOH' }],
  ['Methylpropionat', 4, 'CCC(=O)OC'],
  ['Ethylbutyrat', 4, 'CCCC(=O)OCC', { alias: 'Ananasaroma' }],
  // Stickstoffverbindungen
  ['Propylamin', 5, 'CCCN'],
  ['Isopropylamin', 5, 'CC(C)N'],
  ['Butylamin', 5, 'CCCCN'],
  ['tert-Butylamin', 5, 'CC(C)(C)N'],
  ['Cyclohexylamin', 5, 'NC1CCCCC1'],
  ['Benzylamin', 5, 'NCc1ccccc1'],
  ['N-Methylanilin', 5, 'CNc1ccccc1'],
  ['N,N-Dimethylanilin', 5, 'CN(C)c1ccccc1'],
  ['Diphenylamin', 5, 'c1ccc(Nc2ccccc2)cc1'],
  ['o-Toluidin', 5, 'Cc1ccccc1N', { alias: '2-Methylanilin' }],
  ['p-Toluidin', 5, 'Cc1ccc(N)cc1', { alias: '4-Methylanilin' }],
  ['p-Nitroanilin', 5, 'Nc1ccc(cc1)[N+](=O)[O-]', { alias: '4-Nitroanilin' }],
  ['Phenylhydrazin', 5, 'NNc1ccccc1'],
  ['Nitroethan', 5, 'CC[N+](=O)[O-]'],
  ['Propionitril', 5, 'CCC#N'],
  ['Malononitril', 5, 'N#CCC#N'],
  ['Adiponitril', 5, 'N#CCCCCC#N'],
  ['Benzylcyanid', 5, 'N#CCc1ccccc1', { alias: 'Phenylacetonitril' }],
  ['Ethanolamin', 5, 'NCCO', { alias: '2-Aminoethanol' }],
  ['Diethanolamin', 5, 'OCCNCCO'],
  ['Triethanolamin', 5, 'OCCN(CCO)CCO', { alias: 'TEA' }],
  ['TMEDA', 5, 'CN(C)CCN(C)C', { alias: 'Tetramethylethylendiamin' }],
  ['DABCO', 5, 'C1CN2CCN1CC2', { alias: '1,4-Diazabicyclo[2.2.2]octan' }],
  ['DBU', 5, 'C1CCC2=NCCCN2CC1'],
  ['Guanidin', 5, 'NC(=N)N'],
  ['Semicarbazid', 5, 'NNC(N)=O'],
  ['Thioharnstoff', 5, 'NC(N)=S'],
  ['Phenylisocyanat', 5, 'O=C=Nc1ccccc1'],
  ['Methylisocyanat', 5, 'CN=C=O', { alias: 'MIC' }],
  ['Hexamethylentetramin', 5, 'C1N2CN3CN1CN(C2)C3', { alias: 'Urotropin' }],
  ['Melamin', 5, 'Nc1nc(N)nc(N)n1'],
  ['Nitrosodimethylamin', 5, 'CN(C)N=O', { alias: 'NDMA' }],
  ['Azoisobutyronitril', 5, 'CC(C)(C#N)N=NC(C)(C)C#N', { alias: 'AIBN' }],
  // Heterocyclen
  ['Oxazol', 6, 'c1cocn1'],
  ['Thiazol', 6, 'c1cscn1'],
  ['Isoxazol', 6, 'c1cnoc1'],
  ['1,2,4-Triazol', 6, 'c1nc[nH]n1'],
  ['Pyridazin', 6, 'c1ccnnc1'],
  ['1,3,5-Triazin', 6, 'c1ncncn1'],
  ['Isochinolin', 6, 'c1ccc2cnccc2c1'],
  ['Acridin', 6, 'c1ccc2nc3ccccc3cc2c1'],
  ['Carbazol', 6, 'c1ccc2c(c1)[nH]c1ccccc12'],
  ['Benzimidazol', 6, 'c1ccc2[nH]cnc2c1'],
  ['Benzofuran', 6, 'c1ccc2occc2c1'],
  ['Benzothiophen', 6, 'c1ccc2sccc2c1'],
  ['Chinoxalin', 6, 'c1ccc2nccnc2c1'],
  ['Piperazin', 6, 'C1CNCCN1'],
  ['Aziridin', 6, 'C1CN1'],
  ['Azetidin', 6, 'C1CNC1'],
  ['Oxetan', 6, 'C1COC1'],
  ['2,6-Lutidin', 6, 'Cc1cccc(C)n1', { alias: '2,6-Dimethylpyridin' }],
  ['2-Picolin', 6, 'Cc1ccccn1', { alias: '2-Methylpyridin' }],
  ['2,2′-Bipyridin', 6, 'c1ccc(nc1)c1ccccn1', { alias: 'bipy' }],
  ['Barbitursäure', 6, 'O=C1CC(=O)NC(=O)N1'],
  ['Sulfolan', 6, 'O=S1(=O)CCCC1'],
  ['Thiophen-2-carbaldehyd', 6, 'O=Cc1cccs1'],
  ['Chroman', 6, 'C1Cc2ccccc2OC1', { alias: 'Chroman' }],
  // Kohlenhydrate
  ['Sorbit', 8, 'OCC(O)C(O)C(O)C(O)CO', { alias: 'Sorbitol, Glucitol' }],
  ['Xylit', 8, 'OCC(O)C(O)C(O)CO', { alias: 'Xylitol' }],
  ['Erythrit', 8, 'OCC(O)C(O)CO', { alias: 'Erythritol' }],
  ['Desoxyribose (offenkettig)', 8, 'OCC(O)C(O)CC=O', { alias: '2-Desoxyribose' }],
  ['Erythrose (offenkettig)', 8, 'OCC(O)C(O)C=O'],
  // Naturstoffe & Biomoleküle
  ['Carvon', 9, 'CC(=C)C1CC=C(C)C(=O)C1', { alias: 'Kümmel/Minze' }],
  ['Linalool', 9, 'CC(C)=CCCC(C)(O)C=C'],
  ['Citronellal', 9, 'CC(CC=O)CCC=C(C)C'],
  ['Cumarin', 9, 'O=C1C=Cc2ccccc2O1'],
  ['Piperin', 9, 'O=C(C=CC=Cc1ccc2OCOc2c1)N1CCCCC1', { alias: 'Pfeffer' }],
  ['Curcumin', 9, 'COc1cc(C=CC(=O)CC(=O)C=Cc2ccc(O)c(OC)c2)ccc1O', { alias: 'Kurkuma' }],
  ['Resveratrol', 9, 'Oc1ccc(C=Cc2cc(O)cc(O)c2)cc1'],
  ['Quercetin', 9, 'O=C1C(O)=C(Oc2cc(O)cc(O)c12)c1ccc(O)c(O)c1', { alias: 'Flavonoid' }],
  ['Chinin', 9, 'COc1ccc2nccc(C(O)C3CC4CCN3CC4C=C)c2c1', { alias: 'Malariamittel' }],
  ['Kokain', 9, 'COC(=O)C1C(OC(=O)c2ccccc2)CC2CCC1N2C'],
  ['Atropin', 9, 'CN1C2CCC1CC(C2)OC(=O)C(CO)c1ccccc1', { alias: 'Tollkirsche' }],
  ['Morphin', 9, 'CN1CCC23C4C1CC5=C2C(=C(C=C5)O)OC3C(C=C4)O', { alias: 'Opiat' }],
  ['Nicotinamid', 9, 'NC(=O)c1cccnc1', { alias: 'Vitamin B3, Niacinamid' }],
  ['Nicotinsäure', 9, 'OC(=O)c1cccnc1', { alias: 'Niacin' }],
  ['Pyridoxin', 9, 'Cc1ncc(CO)c(CO)c1O', { alias: 'Vitamin B6' }],
  ['Liponsäure', 9, 'OC(=O)CCCCC1CCSS1', { alias: 'α-Liponsäure' }],
  ['Biotin', 9, 'O=C(O)CCCCC1SCC2NC(=O)NC12', { alias: 'Vitamin B7, Vitamin H' }],
  ['Kreatin', 9, 'CN(CC(=O)O)C(N)=N'],
  ['Kreatinin', 9, 'CN1CC(=O)NC1=N'],
  ['Carnitin', 9, 'C[N+](C)(C)CC(O)CC(=O)[O-]'],
  ['Cholin', 9, 'C[N+](C)(C)CCO'],
  ['Spermidin', 9, 'NCCCCNCCCN'],
  ['Putrescin', 9, 'NCCCCN', { alias: 'Butan-1,4-diamin' }],
  ['Cadaverin', 9, 'NCCCCCN', { alias: 'Pentan-1,5-diamin' }],
  ['Tyramin', 9, 'NCCc1ccc(O)cc1'],
  ['Phenethylamin', 9, 'NCCc1ccccc1', { alias: '2-Phenylethylamin' }],
  ['Mescalin', 9, 'COc1cc(CCN)cc(OC)c1OC'],
  ['Indol-3-essigsäure', 9, 'OC(=O)Cc1c[nH]c2ccccc12', { alias: 'Auxin, IAA' }],
  ['Anethol', 9, 'COc1ccc(C=CC)cc1', { alias: 'Anis' }],
  ['Safrol', 9, 'C=CCc1ccc2OCOc2c1'],
  ['β-Carotin', 9, 'CC1=C(C(C)(C)CCC1)C=CC(C)=CC=CC(C)=CC=CC=C(C)C=CC=C(C)C=CC1=C(C)CCCC1(C)C', { alias: 'Provitamin A' }],
  ['Squalen', 9, 'CC(C)=CCCC(C)=CCCC(C)=CCCC=C(C)CCC=C(C)CCC=C(C)C'],
  // Arzneistoffe
  ['Ketoprofen', 10, 'CC(C(=O)O)c1cccc(c1)C(=O)c1ccccc1'],
  ['Indometacin', 10, 'COc1ccc2n(C(=O)c3ccc(Cl)cc3)c(C)c(CC(=O)O)c2c1'],
  ['Phenacetin', 10, 'CCOc1ccc(NC(C)=O)cc1'],
  ['Sulfanilamid', 10, 'Nc1ccc(cc1)S(N)(=O)=O', { alias: 'Sulfonamid' }],
  ['Sulfamethoxazol', 10, 'Cc1cc(NS(=O)(=O)c2ccc(N)cc2)no1'],
  ['Chloramphenicol', 10, 'OCC(NC(=O)C(Cl)Cl)C(O)c1ccc(cc1)[N+](=O)[O-]'],
  ['Isoniazid', 10, 'NNC(=O)c1ccncc1', { alias: 'Tuberkulose' }],
  ['Captopril', 10, 'CC(CS)C(=O)N1CCCC1C(=O)O', { alias: 'ACE-Hemmer' }],
  ['Propranolol', 10, 'CC(C)NCC(O)COc1cccc2ccccc12', { alias: 'Betablocker' }],
  ['Atenolol', 10, 'CC(C)NCC(O)COc1ccc(CC(N)=O)cc1', { alias: 'Betablocker' }],
  ['Fluoxetin', 10, 'CNCCC(Oc1ccc(cc1)C(F)(F)F)c1ccccc1', { alias: 'Prozac' }],
  ['Omeprazol', 10, 'COc1ccc2[nH]c(nc2c1)S(=O)Cc1ncc(C)c(OC)c1C', { alias: 'Protonenpumpenhemmer' }],
  ['Ciprofloxacin', 10, 'O=C(O)C1=CN(C2CC2)c2cc(N3CCNCC3)c(F)cc2C1=O', { alias: 'Antibiotikum' }],
  ['Ketamin', 10, 'CNC1(CCCCC1=O)c1ccccc1Cl'],
  ['Phenobarbital', 10, 'CCC1(C(=O)NC(=O)NC1=O)c1ccccc1'],
  ['Allopurinol', 10, 'O=C1NC=NC2=C1C=NN2', { alias: 'Gicht' }],
  ['Furosemid', 10, 'NS(=O)(=O)c1cc(C(=O)O)c(NCc2ccco2)cc1Cl', { alias: 'Diuretikum' }],
  ['Hydrochlorothiazid', 10, 'NS(=O)(=O)c1cc2c(cc1Cl)NCNS2(=O)=O', { alias: 'HCT' }],
  ['Warfarin', 10, 'CC(=O)CC(c1ccccc1)C1=C(O)c2ccccc2OC1=O', { alias: 'Blutverdünner' }],
  ['Nifedipin', 10, 'COC(=O)C1=C(C)NC(C)=C(C(=O)OC)C1c1ccccc1[N+](=O)[O-]'],
  ['Methylphenidat', 10, 'COC(=O)C(c1ccccc1)C1CCCCN1', { alias: 'Ritalin' }],
  ['Ephedrin', 10, 'CNC(C)C(O)c1ccccc1'],
  ['Valproinsäure', 10, 'CCCC(CCC)C(=O)O', { alias: 'Antiepileptikum' }],
  ['Levodopa', 10, 'NC(Cc1ccc(O)c(O)c1)C(=O)O', { alias: 'L-DOPA' }],
  ['Acetylcystein', 10, 'CC(=O)NC(CS)C(=O)O', { alias: 'ACC' }],
  ['Mefenaminsäure', 10, 'Cc1cccc(Nc2ccccc2C(=O)O)c1C'],
  // Farbstoffe & Indikatoren
  ['Fluorescein', 11, 'O=C1OC2(c3ccccc13)c1ccc(O)cc1Oc1cc(O)ccc12'],
  ['Kristallviolett', 11, 'CN(C)c1ccc(cc1)C(=C1C=CC(C=C1)=[N+](C)C)c1ccc(cc1)N(C)C', { alias: 'Gentianaviolett' }],
  ['Malachitgrün', 11, 'CN(C)c1ccc(cc1)C(=C1C=CC(C=C1)=[N+](C)C)c1ccccc1'],
  ['Methylrot', 11, 'CN(C)c1ccc(cc1)N=Nc1ccccc1C(=O)O', { alias: 'Indikator' }],
  ['4-Aminoazobenzol', 11, 'Nc1ccc(cc1)N=Nc1ccccc1', { alias: 'Anilingelb' }],
  // Anorganisch & Ionen
  ['Natriumcarbonat', 12, '[Na+].[Na+].[O-]C([O-])=O', { alias: 'Soda' }],
  ['Natriumhydrogencarbonat', 12, '[Na+].OC([O-])=O', { alias: 'Natron' }],
  ['Calciumcarbonat', 12, '[Ca+2].[O-]C([O-])=O', { alias: 'Kalk' }],
  ['Kaliumnitrat', 12, '[K+].[O-][N+](=O)[O-]', { alias: 'Salpeter' }],
  ['Natriumsulfat', 12, '[Na+].[Na+].[O-]S([O-])(=O)=O'],
  ['Schwefeldioxid', 12, 'O=S=O'],
  ['Schwefeltrioxid', 12, 'O=S(=O)=O'],
  ['Distickstoffmonoxid', 12, 'N#[N+][O-]', { alias: 'Lachgas' }],
  ['Ozon', 12, '[O-][O+]=O'],
  ['Thionylchlorid', 12, 'O=S(Cl)Cl'],
  ['Phosphortrichlorid', 12, 'ClP(Cl)Cl'],
  ['Phosphorpentachlorid', 12, 'ClP(Cl)(Cl)(Cl)Cl'],
  ['Borsäure', 12, 'OB(O)O'],
  ['Hydroxylamin', 12, 'NO'],
  ['Ammoniumnitrat', 12, '[NH4+].[O-][N+](=O)[O-]'],
  ['Natriumhypochlorit', 12, '[Na+].[O-]Cl', { alias: 'Bleichlauge' }],
  ['Iod', 12, 'II'],
  ['Brom', 12, 'BrBr'],
  ['Chlor', 12, 'ClCl'],
  ['Sauerstoff', 12, 'O=O'],
  ['Stickstoff', 12, 'N#N'],
  ['Kaliumhydroxid', 12, '[K+].[OH-]', { alias: 'Kalilauge' }],
  ['Calciumhydroxid', 12, '[Ca+2].[OH-].[OH-]', { alias: 'Löschkalk' }],
  ['Salpetrige Säure', 12, 'ON=O'],
  ['Schweflige Säure', 12, 'OS(O)=O'],
  ['Perchlorsäure', 12, 'OCl(=O)(=O)=O'],
  // Peptid- & Oligosynthese
  ['HFIP', 13, 'OC(C(F)(F)F)C(F)(F)F', { alias: 'Hexafluorisopropanol' }],
  ['Thioanisol', 13, 'CSc1ccccc1', { alias: 'Scavenger' }],
  ['DTT', 13, 'SCC(O)C(O)CS', { alias: 'Dithiothreitol' }],
  ['TCEP', 13, 'OC(=O)CCP(CCC(=O)O)CCC(=O)O'],
  ['Iodacetamid', 13, 'NC(=O)CI'],
  ['2,4,6-Collidin', 13, 'Cc1cc(C)nc(C)c1', { alias: 'Collidin' }],
  ['Dibenzofulven', 13, 'C=C1c2ccccc2c2ccccc12', { alias: 'Dibenzofulven' }],
  // ---- 1.56: Bausteine für die Syntheseplanung
  ['4-Aminophenol', 5, 'Nc1ccc(O)cc1', { alias: 'Paracetamol-Vorstufe' }],
  ['4-Nitrophenol', 5, 'Oc1ccc(cc1)[N+](=O)[O-]'],
  ['4-Nitrotoluol', 5, 'Cc1ccc(cc1)[N+](=O)[O-]'],
  ['Phenylboronsäure', 0, 'OB(O)c1ccccc1', { alias: 'Suzuki-Baustein' }],
  ['4-Bromanisol', 1, 'COc1ccc(Br)cc1'],
  ['Ethylbromacetat', 4, 'CCOC(=O)CBr', { alias: 'Bromessigsäureethylester' }],
  ['Benzylacetat', 4, 'CC(=O)OCc1ccccc1', { alias: 'Jasmin' }],
  ['Ethylcinnamat', 4, 'CCOC(=O)C=Cc1ccccc1', { alias: 'Zimtsäureethylester' }],
];

const ChemDB = {
  _cache: new Map(),
  entries() {
    if (!this._list) this._list = CHEM_DB.map(([name, cat, smi, o = {}], i) => ({ i, name, cat: CHEM_DB_CATS[cat], smi, ...o }));
    return this._list;
  },
  mol(e) {
    let m = this._cache.get(e.i);
    if (!m) {
      try { m = ChemSmiles.toMol(e.smi); } catch (err) { console.warn('Vorlage', e.name, err); m = ChemMol.empty(); }
      this._cache.set(e.i, m);
    }
    return ChemMol.clone(m);
  },
  /* Konstitutions-Schlüssel ohne Anordnung (schnell) */
  key(e) {
    if (e._key == null) { try { e._key = ChemMatch.key(ChemSmiles.toMol(e.smi, { layout: false })); } catch (err) { e._key = ''; } }
    return e._key;
  },
  info(e) {
    if (e._info) return e._info;
    const m = this.mol(e);
    const an = ChemMol.analyze(m);
    e._info = { key: this.key(e), formula: an.hill, mass: an.mass, rs: this.sig(an) };
    return e._info;
  },
  /* Trivialname der gezeichneten Struktur (oder null); seit 1.58 auch einfache Abkömmlinge bekannter Stoffe
   * (Ester, Ether, N-Alkyl, Acetyl, Schutzgruppen, Salze) – mit { exact: true } nur genaue Treffer */
  find(m, o) {
    const f = this.findExact(m);
    if (f || (o && o.exact)) return f;
    try { return this.derivative(m); } catch (e) { return null; }
  },
  /* ---------------------------------------------------------- Abkömmlinge erkennen (1.58)
   * Bis zu zwei kleine Reste an O/N werden abgelöst (bzw. Salz/Ladung entfernt), bis ein Eintrag der Datenbank genau
   * passt; der Name entsteht aus dem Grundstoff: „Salicylsäure-ethylester“, „Boc-Alanin-methylester“,
   * „N-Methyl-4-Aminophenol“, „Anilin (Hydrochlorid)“. */
  DERIV: [
    ['C', 0, 'Methyl', 'alkyl'], ['CC', 1, 'Ethyl', 'alkyl'], ['CCC', 1, 'Propyl', 'alkyl'], ['CCC', 2, 'Isopropyl', 'alkyl'], ['CCCC', 1, 'Butyl', 'alkyl'],
    ['CC(C)C', 3, 'tert-Butyl', 'alkyl'], ['Cc1ccccc1', 1, 'Benzyl', 'alkyl'], ['CC=O', 2, 'Acetyl', 'acyl'], ['O=Cc1ccccc1', 2, 'Benzoyl', 'acyl'],
    ['O=COC(C)(C)C', 2, 'Boc', 'pg'], ['O=COCc1ccccc1', 2, 'Z', 'pg'], ['O=COCC1c2ccccc2c2ccccc12', 2, 'Fmoc', 'pg'], ['C=O', 1, 'Formyl', 'acyl'],
  ],
  derivRefs() {
    if (!this._dref) this._dref = this.DERIV.map(([smi, d, name, kind]) => { let key = ''; try { key = ChemMatch.key(ChemSmiles.toMol(smi, { layout: false })); } catch (e) { key = ''; } return { key, d, name, kind }; });
    return this._dref;
  },
  derivative(m0) {
    if (!m0.atoms.length || m0.atoms.length > 120) return null;
    const clone = (m) => ({ atoms: m.atoms.map(a => ({ ...a })), bonds: m.bonds.map(b => ({ ...b })), nid: m.nid });
    const nbs = (m, id) => m.bonds.filter(b => b.a === id || b.b === id).map(b => ({ id: b.a === id ? b.b : b.a, o: b.o }));
    const at = (m, id) => m.atoms.find(a => a.id === id);
    const side = (m, start, from) => { const seen = new Set([start]), st = [start]; while (st.length) { const v = st.pop(); for (const n of nbs(m, v)) if (n.id !== from && !seen.has(n.id)) { if (v === start && n.id === from) continue; seen.add(n.id); st.push(n.id); } } return seen; };
    const sub = (m, ids) => ({ atoms: m.atoms.filter(a => ids.has(a.id)), bonds: m.bonds.filter(b => ids.has(b.a) && ids.has(b.b)), nid: m.nid });
    let m = clone(m0);
    // ohne explizite H
    const hs = new Set(m.atoms.filter(a => a.el === 'H' && nbs(m, a.id).length === 1).map(a => a.id));
    if (hs.size) m = { atoms: m.atoms.filter(a => !hs.has(a.id)), bonds: m.bonds.filter(b => !hs.has(b.a) && !hs.has(b.b)), nid: m.nid };
    /* Salz: grösster Teil, Ladungen neutralisieren (COO⁻ → COOH, NH₃⁺ → NH₂) */
    const parts = [];
    { const left = new Set(m.atoms.map(a => a.id)); while (left.size) { const s0 = [...left][0]; const comp = side(m, s0, null); comp.add(s0); for (const x of comp) left.delete(x); parts.push(comp); } }
    let salt = '';
    if (parts.length > 1) {
      parts.sort((a, b) => b.size - a.size);
      const rest = parts.slice(1).map(p => sub(m, p));
      const els = rest.map(r => r.atoms.length === 1 ? r.atoms[0].el : '');
      salt = els.includes('Na') ? 'Natriumsalz' : els.includes('K') ? 'Kaliumsalz' : els.includes('Li') ? 'Lithiumsalz' : els.includes('Ca') ? 'Calciumsalz' : els.includes('Cl') ? 'Hydrochlorid' : els.includes('Br') ? 'Hydrobromid' : '';
      if (!salt) return null;
      m = sub(m, parts[0]);
    }
    let charged = false;
    for (const a of m.atoms) {
      if (!a.q) continue;
      if ((a.el === 'O' || a.el === 'S') && a.q === -1) { a.q = 0; charged = true; }
      else if (a.el === 'N' && a.q === 1 && nbs(m, a.id).filter(n => at(m, n.id).el !== 'O').length < 4 && !nbs(m, a.id).some(n => at(m, n.id).el === 'O')) { a.q = 0; charged = true; }
    }
    if (!salt && charged) salt = 'ionisch';
    const fmtSalt = (n) => salt && salt !== 'ionisch' ? `${n} (${salt})` : salt === 'ionisch' ? n + ' (Ion)' : n;
    if (salt) { const f = this.findExact(m); if (f) return { e: f.e, name: fmtSalt(f.name), iupac: null, deriv: true }; }
    /* Reste an O/N ablösen (Breitensuche, höchstens zwei) */
    const refs = this.derivRefs();
    const carbonylC = (mm, id) => { const a = at(mm, id); return a && a.el === 'C' && nbs(mm, id).some(n => n.o === 2 && at(mm, n.id).el === 'O'); };
    const removals = (mm) => {
      const out = [];
      for (const x of mm.atoms) {
        if (x.el !== 'O' && x.el !== 'N') continue;
        const ns = nbs(mm, x.id);
        if (ns.length < (x.el === 'O' ? 2 : 1) || ns.some(n => n.o !== 1)) continue;
        for (const n of ns) {
          const S = side(mm, n.id, x.id);
          if (S.has(x.id) || S.size > 16 || S.size >= mm.atoms.length - 1) continue;
          const g = sub(mm, S);
          let key; try { key = ChemMatch.key(g); } catch (e) { continue; }
          const d = nbs(mm, n.id).filter(q => S.has(q.id)).length;
          const ref = refs.find(r => r.key === key && r.d === d);
          if (!ref) continue;
          const other = ns.find(q => q.id !== n.id);
          const ester = x.el === 'O' && other && carbonylC(mm, other.id);
          // Ester-Alkyl nur am Säure-O; Acyl/Schutzgruppe nur am N oder an einem Alkohol-/Phenol-O
          if (ref.kind === 'alkyl' && x.el === 'O' && !ester && ref.name !== 'Methyl' && ref.name !== 'Ethyl' && ref.name !== 'Benzyl') continue;
          if (ref.kind !== 'alkyl' && ester) continue;
          const keep = new Set(mm.atoms.map(a => a.id).filter(id => !S.has(id)));
          const fmt = ref.kind === 'pg' ? (b) => `${ref.name}-${b}`
            : ref.kind === 'acyl' ? (b) => `${x.el}-${ref.name}-${b}`
              : ester ? (b) => `${b}-${ref.name.toLowerCase()}ester` : (b) => `${x.el}-${ref.name}-${b}`;
          out.push({ m: sub(mm, keep), fmt });
        }
      }
      return out;
    };
    let front = [{ m, fs: [] }];
    for (let depth = 0; depth < 2; depth++) {
      const nx = [];
      for (const st of front) for (const r of removals(st.m)) {
        const fs = [...st.fs, r.fmt];
        const f = this.findExact(r.m);
        if (f) { let name = f.name; for (const fn of fs.slice().reverse()) name = fn(name); return { e: f.e, name: fmtSalt(name), iupac: null, deriv: true }; }
        nx.push({ m: r.m, fs });
      }
      front = nx.slice(0, 40);
    }
    return null;
  },
  findExact(m) {
    if (!m.atoms.length) return null;
    let key;
    try { key = ChemMatch.key(m); } catch (e) { return null; }
    const hits = this.entries().filter(e => this.key(e) === key);
    if (!hits.length) return null;
    const an = ChemMol.analyze(m);
    const rs = this.sig(an);
    const inv = this.sig(an, true);
    const defined = an.centers.every(c => c.rs);
    if (defined) {
      const exact = hits.find(e => this.info(e).rs === rs);
      if (exact) return { e: exact, name: (exact.pre || '') + exact.name, iupac: exact.iupac };
      const mirror = hits.find(e => this.info(e).rs === inv && /^[DL]-$/.test(e.pre || ''));
      if (mirror) return { e: mirror, name: (mirror.pre === 'L-' ? 'D-' : 'L-') + mirror.name, iupac: null };
    }
    const e = hits[0];
    return { e, name: e.base || e.name, iupac: an.centers.length ? null : e.iupac };
  },
  /* Stereo-Signatur: R/S-Anzahl und E/Z-Anzahl (gespiegelt: R<->S) */
  sig(an, mirror) {
    const r = an.centers.map(c => c.rs ? (mirror ? (c.rs === 'R' ? 'S' : 'R') : c.rs) : '?').sort().join('');
    return r + '|' + an.ez.map(e => e.ez).sort().join('');
  },
  search(q, cat) {
    const s = String(q || '').trim().toLowerCase();
    return this.entries().filter(e => (!cat || e.cat === cat) && (!s || e.name.toLowerCase().includes(s) || (e.alias || '').toLowerCase().includes(s) || (e.iupac || '').toLowerCase().includes(s)));
  },
};
