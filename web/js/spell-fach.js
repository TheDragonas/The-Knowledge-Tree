'use strict';
/* Fachwörter für die Rechtschreibprüfung (seit 1.38): Naturwissenschaften, Mathematik, Informatik, Medizin – Begriffe,
 * die in allgemeinen Wörterbüchern oft fehlen. Grundformen; gängige Endungen (-e, -en, -n, -s, -es, -er, -ern, -em)
 * erkennt Spell.extra selbst, Zusammensetzungen (Titrations|kurve) die Prüfung. Element- und Molekülnamen kommen
 * zusätzlich aus Chem-Draw (CHEM_DB) und dem Periodensystem. */
const SPELL_FACH = {
  de: `
Abszisse Absorbanz Absorptionsspektrum Acetal Acetat Aceton Acetylen Acylierung Addition Adsorbat Adsorbens Aerosol Affinität
Aktivierungsenergie Aktivität Alanin Aldehyd Aldol Aldose Alkalimetall Alkalität Alkan Alkanol Alkanal Alkanon Alken Alkin Alkohol Alkoholat Alkylierung
Allotropie Alpha-Helix Amid Amin Aminosäure Ammoniak Ammonium Amphiphil amphoter Ampholyt Amplitude Amylase Amylopektin Amylose anabol Anabolismus Analyt
Anion Anode Anomer anorganisch Anthocyan Antigen Antikörper Antiteilchen aprotisch Äquivalenzpunkt Aren Argon aromatisch Aromat Aromatizität
Arrhenius Asymptote asymptotisch Atombindung Atommasse Atomorbital Atomradius ATP Aufenthaltswahrscheinlichkeit Avogadro Avogadro-Konstante Azeotrop
Bakteriophage Base Basenpaar Benzol Benzoesäure Bindungsenergie Bindungslänge Bindungswinkel Biokatalysator Biomolekül Biuret Boltzmann Brönsted
Bürette Butan Butanol Carbanion Carbokation Carbonat Carbonsäure Carbonyl Carbonylgruppe Carboxylgruppe Carboxylat Celsius Cellulose Chelat Chelatkomplex
Chiralität chiral Chlorid Chlorophyll Chloroplast Chromatografie Chromatographie Chromophor Chromosom cis-trans Coenzym Cofaktor Coulomb Cyanid Cyclohexan
Cytoplasma Cytosin Decarboxylierung Dehydratisierung Dehydrierung Deprotonierung Derivat Desoxyribose Destillat Destillation Diastereomer Dichte Dielektrikum
Diffusion Dipol Dipolmoment Disaccharid Dispersion Disproportionierung Dissoziation Dissoziationskonstante Disulfidbrücke DNA Doppelbindung Doppelhelix Dotierung
Dreifachbindung Edelgas Edelgaskonfiguration Edukt Eigenvektor Eigenwert Einfachbindung Elektrode Elektrolyse Elektrolyt Elektronegativität Elektronenpaar
Elektronenkonfiguration Elektronenpaarbindung elektrophil Elektrophil Elementarladung Eliminierung Emulgator Emulsion Enantiomer Endothermie endotherm endergon
Enthalpie Entropie Enzym Epoxid Erlenmeyerkolben Ester Esterbildung Esterhydrolyse Ethan Ethanal Ethanol Ethansäure Ethen Ether Ethin exergon exotherm
Faraday Fehling Fermentation Fettsäure Flammenfärbung Fluoreszenz Formalladung Fraktionierung Fructose Fullerene Funktionelle Galaktose Galvanik galvanisch
Gaschromatografie Gefrierpunktserniedrigung Genom Genotyp Gibbs Gleichgewichtskonstante Glucose Glykogen Glykolyse Glykosid Glykosidbindung Glycerin Glycin Gradient
Grenzformel Grignard Guanin Halbacetal Halbwertszeit Halbzelle Halogen Halogenalkan Halogenid Hämoglobin Hauptgruppe Hauptquantenzahl Heterozyklus heterogen
Hexan Homolog homologe Hybridisierung Hybridorbital Hydratation Hydrathülle Hydrierung Hydrolyse Hydronium Hydroxid hydrophil hydrophob Hydroxylgruppe Hydrogencarbonat
Indikator Inhibitor Interferenz intermolekular intramolekular Ionenbindung Ionengitter Ionenprodukt Ionisierungsenergie Isomer Isomerie Isotop Isotopie IUPAC
Joule Kalorimeter Kalorimetrie Kapillare Katabolismus Katalysator Katalyse Kathode Kation Keton Ketose Kettenreaktion Kinetik Kohlenhydrat Kohlenwasserstoff
Kolloid Komplexbildung Komplexion Kondensation Kondensationsreaktion Konfiguration Konformation Konformer Konjugation konjugiert Konstitution Konstitutionsisomer
Korrosion kovalent Kristallgitter Kristallisation Lactat Lactose Ladungsdichte Ladungsverteilung Le-Chatelier Leitfähigkeit Lewis-Formel Lewis-Säure Ligand
Lipid lipophil lipophob Lösungsmittel Lösungsenthalpie Löslichkeit Löslichkeitsprodukt Makromolekül Maltose Massenspektrometrie Massenwirkungsgesetz Mesomerie
mesomer Metabolismus Metallbindung Methan Methanal Methanol Methansäure Micelle Mizelle Mitochondrium Mitochondrien Mitose Meiose Mol Molalität molar Molarität
Molekülorbital Molekül Monomer Monosaccharid Mutagen Mutation Nebengruppe Neutralisation Nitrat Nitrit Nomenklatur Nukleinsäure Nukleophil nukleophil Nucleophil
Nukleotid Nukleus Oktettregel Oligosaccharid Orbital Organik Organell Osmose osmotisch Oxid Oxidation Oxidationsmittel Oxidationszahl Oxoniumion Ozon
Partialdruck Partialladung Pentan Peptid Peptidbindung Periodensystem Permeabilität Peroxid pH-Wert Phenol Phenolphthalein Phenyl Phosphat Phospholipid
Photosynthese Fotosynthese Pipette Pipettieren pKs-Wert pKs Polarisierbarkeit polar Polarität Polyester Polyethylen Polymer Polymerisation Polypeptid Polysaccharid
Propan Propanol Propanon Propen Protein Protolyse Proton Protonierung Puffer Pufferlösung Purin Pyrimidin Quantenzahl Racemat Radikal radikalisch Reaktand
Reaktionsenthalpie Reaktionsgeschwindigkeit Reaktionsmechanismus Redoxpaar Redoxreaktion Reduktion Reduktionsmittel Reinstoff Replikation Resonanz Retentionszeit
Ribose Ribosom RNA Rückflusskühler Salzbrücke Saccharose Sättigung Säure Säurekonstante Schmelzpunkt Seife Siedepunkt Silikat Spannungsreihe Spektroskopie
Spektrum Spinquantenzahl Stärke Stereochemie Stereoisomer Stereozentrum Stoffmenge Stoffmengenkonzentration Stöchiometrie stöchiometrisch Strukturformel
Sublimation Substituent Substitution Substrat Sulfat Sulfid Sulfit Summenformel Suspension Synthese Tautomerie Temperaturkoeffizient Tenside Tensid Tetraeder
tetraedrisch Thermodynamik Thymin Titer Titrant Titration Titrationskurve Transkription Translation Triglycerid Tripelpunkt Uracil Valenzelektron Valenzstrich
Van-der-Waals Van-der-Waals-Kraft Verbrennungsenthalpie Verseifung Viskosität Wasserstoffbrücke Wasserstoffbrückenbindung Wertigkeit Zentralatom Zwitterion
Ableitung Abszissenachse Achsenabschnitt affin Algebra Algorithmus Amplitude Ankathete Approximation arithmetisch Asymptote Binom Binomialkoeffizient
Binomialverteilung Bogenmass Bruchterm Cosinus Kosinus Definitionsbereich Definitionsmenge Determinante Diagonalmatrix Differenzial Differential
Differenzialgleichung Differentialgleichung Differenzialrechnung Differenzenquotient Differenzialquotient differenzierbar Diskriminante Divergenz Eigenraum
Einheitsvektor Ellipse Erwartungswert Exponent Exponentialfunktion Extrempunkt Extremum Extremstelle Faktorisierung Fakultät Funktionsgleichung Funktionsterm
Gegenkathete Geometrie geometrisch Gradient Graph Grenzwert Hesse Hochpunkt Hyperbel Hypotenuse Integral Integration Integrand Integrationskonstante Intervall
Inverse invertierbar Kathete Koeffizient Kombinatorik Kongruenz konvergent Konvergenz Koordinatensystem Kreuzprodukt Krümmung Kurvendiskussion
Lineare Linearfaktor Logarithmus logarithmisch Lösungsmenge Matrix Matrizen Median Mitternachtsformel Monotonie Normalverteilung Nullstelle Ordinate Orthogonal
orthogonal Parabel Parameter Partialbruch Permutation Polynom Polynomdivision Potenz Potenzfunktion Primfaktor Primzahl Produktregel Quadrant Quotientenregel
Radiant Reziprok reziprok Sattelpunkt Sekante Signifikanz Sinus Skalar Skalarprodukt Spatprodukt Standardabweichung Stammfunktion Steigung Stochastik
Substitution Summenregel Symmetrie Tangens Tangente Tiefpunkt Trigonometrie trigonometrisch Umkehrfunktion Ungleichung Varianz Vektor Vektorraum
Wahrscheinlichkeit Wendepunkt Wertebereich Wertemenge Winkelhalbierende Wurzelfunktion Zahlenfolge Zufallsvariable Kettenregel Scheitelpunkt
Beschleunigung Brennweite Dopplereffekt Drehimpuls Drehmoment Elektronvolt Energieerhaltung Feldlinie Feldstärke Frequenz Gravitation Halbleiter Hertz
Impuls Induktion Induktivität Interferenz Kapazität Kondensator Kraftstoss Lichtgeschwindigkeit Lorentzkraft Magnetfeld Newton Ohm Oszillator Pascal
Photon Photoeffekt Potential Potenzial Quantenmechanik Radioaktivität Reflexion Refraktion Relativitätstheorie Resistanz Resonanz Spannung Supraleiter
Thermodynamik Transformator Volt Watt Wellenlänge Widerstand Wirkungsgrad Zentripetalkraft Zentrifugalkraft
Algorithmus Array Backend Bit Boolean Browser Byte Compiler Cloud Datenbank Datentyp Debugger Frontend Hardware Interface Iteration iterativ Klasse Laufzeit
Objekt objektorientiert Parameter Pixel Programmierung Prozessor Rekursion rekursiv Schnittstelle Server Software Speicher Syntax Variable Vererbung
Anatomie Antibiotikum Antikörper Arterie Bakterie Blutdruck Diagnose Diagnostik Enzymatik Epidermis Erythrozyt Gen Genetik Hormon Immunsystem Infektion
Insulin Leukozyt Metabolit Mikroorganismus Nervenzelle Neuron Organismus Pathogen Physiologie Plasmid Protozoon Rezeptor Symptom Synapse Therapie Thrombozyt
Toxin Virus Viren Zellkern Zellmembran Zellwand Zytoplasma Zytologie Ökologie Ökosystem Photosynthese Fotosynthese Chlorophyll Chloroplasten Evolution
Selektion Population Biotop Biozönose Destruent Konsument Produzent Symbiose Parasit Allel dominant rezessiv heterozygot homozygot Phänotyp Genotyp`,
  en: `
absorbance acetal acetate acetone acetylene acylation adsorbate adsorbent aerosol aldehyde aldol aldose aliphatic alkane alkanol alkene alkyne alkylation
allotrope amide amine amino ammonia ammonium amphiphilic amphoteric amylase amylopectin amylose anabolic anabolism analyte anion anode anomer anomeric
antiparticle aprotic arene aromaticity Arrhenius asymptote asymptotic Avogadro azeotrope benzene biomolecule Boltzmann Brønsted Bronsted burette carbanion
carbocation carbonate carbonyl carboxyl carboxylate carboxylic catalysis catalyst cathode cation chelate chirality chiral chromatography chromophore
chromosome coenzyme cofactor colloid conformer conjugated conjugation covalent cyclohexane cytoplasm cytosine decarboxylation dehydration dehydrogenation
deprotonation diastereomer dielectric dipole disaccharide disproportionation dissociation distillate distillation electrolysis electrolyte electronegativity
electrophile electrophilic elimination emulsifier enantiomer endergonic endothermic enthalpy entropy enzyme epoxide esterification ethanol ethene ethyne
exergonic exothermic Faraday fermentation fluorescence fructose fullerene galactose galvanic genome genotype Gibbs glucose glycerol glycine glycogen
glycolysis glycoside glycosidic halide haloalkane hemiacetal heterocycle heterogeneous homologous hybridization hybridisation hydration hydrogenation hydrolysis
hydronium hydrophilic hydrophobic hydroxide hydroxyl intermolecular intramolecular ionization isomer isomerism isotope IUPAC kinetics lactate lactose ligand
lipid lipophilic macromolecule maltose metabolism metabolite micelle mitochondria mitochondrion mitosis meiosis molality molar molarity monomer monosaccharide
nucleophile nucleophilic nucleotide nucleic octet oligosaccharide orbital organelle osmosis osmotic oxidation peptide permeability peroxide phenol
phenolphthalein phospholipid photosynthesis pipette polarizability polymer polymerization polypeptide polysaccharide propanol propanone protolysis protonation
purine pyrimidine quantum racemate racemic radical reactant redox replication resonance ribose ribosome saponification spectroscopy spectrometry
stereochemistry stereoisomer stoichiometry stoichiometric substituent sublimation substrate sucrose sulfate sulphate sulfide surfactant tautomer
tautomerism tetrahedral thermodynamics thymine titrant titration transcription triglyceride uracil valence viscosity zwitterion
abscissa algebra algorithm antiderivative approximation arithmetic asymptote binomial coefficient combinatorics congruence convergent convergence cosine
derivative determinant diagonalizable differentiable differential discriminant divergence eigenvalue eigenvector eigenspace ellipse exponent exponential
extremum factorial factorization gradient hyperbola hypotenuse integrable integrand integral interval invertible logarithm logarithmic matrices matrix
median monotonic monotonicity orthogonal parabola parametric permutation polynomial quadrant quotient radian reciprocal scalar secant sine tangent
trigonometry trigonometric variance vector inflection
acceleration capacitance capacitor diffraction electromagnetic electronvolt frequency gravitation impedance inductance induction interference joule
kinematics momentum oscillator oscillation photon potential refraction relativity semiconductor superconductor torque transformer wavelength
antibiotic antibody antigen artery bacterium bacteria diagnosis enzymatic epidermis erythrocyte genetics hormone immune infection insulin leukocyte
microorganism neuron organism pathogen physiology plasmid receptor symptom synapse therapy thrombocyte toxin virus nucleus membrane ecology ecosystem
allele dominant recessive heterozygous homozygous phenotype genotype symbiosis parasite biotope
backend boolean compiler debugger frontend iteration iterative recursion recursive runtime syntax`,
};
if (typeof module !== 'undefined') module.exports = { SPELL_FACH };
