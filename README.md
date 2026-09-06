# 🔒 DocTranslate Local Studio

> **Application Web de Traduction de Documents 100% Confidentielle et Locale (PDF, Word, PowerPoint + OCR)**

DocTranslate est une application web moderne permettant de traduire l'intégralité de vos documents d'entreprise ou confidentiels (**Word `.docx`**, **PowerPoint `.pptx`** et **PDF `.pdf`**) tout en préservant fidèlement la mise en page, le style et les images d'origine.

---

## 🛡️ Garantie de Confidentialité Stricte (0 Fuite de Données)

- **Calcul 100% Client-Side** : Le décodage, l'extraction XML/PDF, l'OCR (`Tesseract.js`) et la traduction neuromimétique (`Transformers.js` / WebAssembly) s'exécutent **dans la mémoire de votre propre navigateur web**.
- **0 Serveur Distant / 0 API Cloud** : Aucune donnée n'est envoyée à OpenAI, DeepL, Google ou n'importe quel autre serveur tiers.
- **Inférence Seule (Zéro Entraînement)** : Le modèle IA est en lecture seule et ne sauvegarde ni ne ré-entraîne aucune donnée sur vos documents.
- **Protection des Noms Propres** : Un système d'écran d'entités (*Entity Shield*) protège automatiquement les noms de personnages, marques, auteurs et titres lors du processus de traduction.

---

## 🚀 Fonctionnalités Clés

1. **Formats Supportés** :
   - **Microsoft Word (`.docx`)** : Modification directe des nœuds XML (`<w:t>`), conservation à 100% des styles, polices, couleurs, tableaux et graphiques.
   - **Microsoft PowerPoint (`.pptx`)** : Modification des diapositives XML (`<a:t>`), conservation des alignements, formes et modèles.
   - **Adobe PDF (`.pdf`)** : Duplication vectorielle des pages originales avec superposition du texte traduit à l'emplacement exact des blocs d'origine.
2. **Reconnaissance OCR Intégrée** :
   - Extraction et traduction du texte figé dans les schémas et images (via `Tesseract.js` WebAssembly).
3. **Prévisualisation Côte à Côte & Édition Directe** :
   - Comparaison paragraphe par paragraphe (Original vs Traduit) avec possibilité de retoucher le texte manuellement avant téléchargement.

---

## 🛠️ Installation & Démarrage Local

```bash
# 1. Cloner le dépôt
git clone https://github.com/Nitrovinzleo/DocTranslate.git
cd DocTranslate

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur de développement local
npm run dev
```

L'application sera accessible sur **`http://localhost:5173/`**.

---

## 📦 Stack Technique

- **Frontend** : React 19 + TypeScript + Vite + TailwindCSS
- **Traitement XML** : `JSZip` + DOMParser
- **Traitement PDF** : `pdfjs-dist` + `pdf-lib`
- **OCR Local** : `Tesseract.js` (WebAssembly)
- **IA Locale** : `@xenova/transformers` (Opus-MT / ONNX WASM)
