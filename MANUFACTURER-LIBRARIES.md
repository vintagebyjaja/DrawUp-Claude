# Manufacturer libraries DrawUp searches (v27-02)

DrawUp only searches the sources below. Each review searches the manufacturers that match its assembly type, plus BIMobject. A slab review, for example, looks at Stego, W. R. MEADOWS, GCP and Sika. A window review looks at Andersen, Pella, Marvin, Kawneer and the flashing makers.

All of them are **link + metadata only**:
- DrawUp shows the manufacturer, product, document title, region and revision, then opens the original on the manufacturer's site.
- It never downloads, stores, redraws or relabels their drawings.
- Copying their files into DrawUp would need each manufacturer's permission.

## Content platform
- **BIMobject** (bimobject.com). It hosts BIM objects that manufacturers publish themselves. I read its terms (effective 27 Sep 2024) on 27 Oct 2026:
  - Allowed: professionals may use the objects in their own project documents.
  - Not allowed: redistributing the content, building it into a product for third parties, or using it to train AI.
  - So DrawUp links to BIMobject product pages, the member downloads from BIMobject under BIMobject's terms, and the card shows the real brand "via BIMobject".
- BIMobject also has a developer API. It would allow deeper search, but it needs a partner agreement, and the price isn't published. Tell me if you want me to look into it.

## Manufacturers by assembly type (47)

| Assembly | Manufacturers |
|---|---|
| Foundations, slabs, below-grade waterproofing | Stego Industries, W. R. MEADOWS, GCP Applied Technologies (Saint-Gobain), Sika, Carlisle, Simpson Strong-Tie |
| Exterior walls, cladding | James Hardie (US and NZ), LP Building Solutions, Nichiha, Sto, Dryvit, Huber ZIP System, Owens Corning, CertainTeed, ROCKWOOL, Kingspan, USG, Georgia-Pacific (DensGlass), ClarkDietrich, Hohmann & Barnard, Mortar Net |
| Air/water barriers, transitions, sealants | DuPont Tyvek, Huber ZIP System, Henry, PROSOCO, Carlisle, GCP, Tremco Sealants, Sika, W. R. MEADOWS, 3M, Dow (DOWSIL), Pecora, Sto, Dryvit |
| Roofs | GAF, Owens Corning, CertainTeed, Holcim Elevate (Firestone), Johns Manville, Carlisle SynTec, Tremco Roofing, Sika (Sarnafil), Henry, Kingspan, ROCKWOOL, Huber, LP, MiTek |
| Parapets, roof edges, coping | Metal-Era, Carlisle, Carlisle SynTec, GAF, Holcim Elevate, Tremco Roofing, Sika |
| Windows, doors, curtain wall | Andersen, Pella, Marvin, Kawneer, YKK AP, plus flashing and sealant makers (DuPont, PROSOCO, GCP, Tremco, Dow, Pecora) |
| Insulation | Owens Corning, ROCKWOOL, Johns Manville, Kingspan, Knauf Insulation, CertainTeed, DuPont (Styrofoam) |
| Interior partitions, fire-rated assemblies | USG, National Gypsum, Georgia-Pacific, CertainTeed, ClarkDietrich, ROCKWOOL, Hilti, 3M, Specified Technologies (STI) |
| Structural connections | Simpson Strong-Tie, Hilti, MiTek, ClarkDietrich |
| Wet areas | Schluter Systems, LATICRETE |

The list is weighted to US practice. James Hardie NZ stays for New Zealand projects, and a reference from another market is flagged on its card. Tell me if your members work elsewhere and I'll add that market's leaders.

## Blocked: never used as a source
Anyone can upload models to these sites, so their content is not from the manufacturer. They are blocked in the database and in the code, so even a settings mistake can't turn them back on:
- RevitCity
- SketchUp 3D Warehouse
- GrabCAD
- BiblioCAD
- CADblocksfree
- cad-blocks.net
- DWGmodels
- CADforum
- free-cad-blocks.com
- TurboSquid
- CGTrader
- Sketchfab

## Worth adding later (not added)
ARCAT and CADdetails host details that manufacturers supply themselves. Both are widely used in US offices. I'd check their terms before adding them; say the word.
