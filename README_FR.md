![PySpur](./docs/images/hero.png)

<p align="center"><strong>PySpur est un créateur d'agents d'IA en Python. Les ingénieurs en IA l'utilisent pour créer des agents, les exécuter étape par étape et inspecter les exécutions passées.</strong></p>

<p align="center">
  <a href="./README.md"><img alt="README in English" src="https://img.shields.io/badge/English-blue"></a>
  <a href="./README_CN.md"><img alt="简体中文版自述文件" src="https://img.shields.io/badge/简体中文-blue"></a>
  <a href="./README_JA.md"><img alt="日本語のREADME" src="https://img.shields.io/badge/日本語-blue"></a>
  <a href="./README_KR.md"><img alt="README in Korean" src="https://img.shields.io/badge/한국어-blue"></a>
  <a href="./README_DE.md"><img alt="Deutsche Version der README" src="https://img.shields.io/badge/Deutsch-blue"></a>
  <a href="./README_FR.md"><img alt="Version française du README" src="https://img.shields.io/badge/Français-blue"></a>
  <a href="./README_ES.md"><img alt="Versión en español del README" src="https://img.shields.io/badge/Español-blue"></a>
</p>

<p align="center">
<a href="https://docs.pyspur.dev/" target="_blank">
  <img alt="Documentation" src="https://img.shields.io/badge/Docs-green.svg?style=for-the-badge&logo=readthedocs&logoColor=white">
</a>
<a href="https://calendly.com/d/cnf9-57m-bv3/pyspur-founders" target="_blank">
  <img alt="Rencontrez-nous" src="https://img.shields.io/badge/Meet%20us-blue.svg?style=for-the-badge&logo=calendly&logoColor=white">
</a>
<a href="https://forms.gle/5wHRctedMpgfNGah7" target="_blank">
  <img alt="Cloud" src="https://img.shields.io/badge/Cloud-orange.svg?style=for-the-badge&logo=cloud&logoColor=white">
</a>
<a href="https://discord.gg/7Spn7C8A5F">
  <img alt="Rejoignez notre Discord" src="https://img.shields.io/badge/Discord-7289DA.svg?style=for-the-badge&logo=discord&logoColor=white">
</a>
</p>

https://github.com/user-attachments/assets/1ebf78c9-94b2-468d-bbbb-566311df16fe

# 🕸️ Pourquoi PySpur ?

- ✅ **Piloté par les tests** : Construisez des workflows, exécutez des cas de test et itérez.
- 👤 **Humain dans la boucle** : Workflows persistants qui attendent l'approbation ou le rejet humain.
- 🔄 **Boucles** : Appels d'outils itératifs avec mémoire.
- 📤 **Téléversement de fichiers** : Téléchargez des fichiers ou collez des URL pour traiter des documents.
- 📋 **Sorties structurées** : Éditeur d'interface utilisateur pour les schémas JSON.
- 🗃️ **RAG** : Analyser, découper, intégrer et insérer ou mettre à jour des données dans une base de données vectorielle.
- 🖼️ **Multimodal** : Support pour vidéos, images, audio, textes, code.
- 🧰 **Outils** : Slack, Firecrawl.dev, Google Sheets, GitHub, et plus encore.
- 🧪 **Évaluations** : Évaluez les agents sur des ensembles de données réelles.
- 🚀 **Déploiement en un clic** : Publiez en tant qu'API et intégrez-le où vous le souhaitez.
- 🐍 **Basé sur Python** : Ajoutez de nouveaux nœuds en créant un seul fichier Python.
- 🎛️ **Support multi-fournisseurs** : >100 fournisseurs de LLM, intégrateurs et bases de données vectorielles.

# ⚡ Démarrage rapide

C'est la manière la plus rapide de commencer. Python 3.11 ou une version supérieure est requis.

1. **Installer PySpur :**
    ```sh
    pip install pyspur
    ```

2. **Initialiser un nouveau projet :**
    ```sh
    pyspur init my-project
    cd my-project
    ```
    Cela va créer un nouveau répertoire avec un fichier `.env`.

3. **Démarrer le serveur :**
    ```sh
    pyspur serve --sqlite
    ```
    Par défaut, cela démarrera l'application PySpur sur `http://localhost:6080` en utilisant une base de données SQLite.
    Nous vous recommandons de configurer une URL d'instance Postgres dans le fichier `.env` pour une expérience plus stable.

4. **[Optionnel] Configurer votre environnement et ajouter des clés API :**
    - **Via l'interface de l'application** : Naviguez vers l'onglet des clés API pour ajouter des clés de fournisseurs (OpenAI, Anthropic, etc.)
    - **Configuration manuelle** : Éditez le fichier `.env` (recommandé : configurez postgres) et redémarrez avec `pyspur serve`

C'est tout ! Cliquez sur « New Spur » pour créer un workflow, ou commencez avec l'un des modèles de base.

# ✨ Avantages principaux

## Points d'arrêt avec humain dans la boucle :

Ces points d'arrêt mettent en pause le flux de travail lorsqu'ils sont atteints et le reprennent dès qu'un humain l'approuve.
Ils permettent une supervision humaine pour les flux de travail nécessitant une assurance qualité : vérifiez les sorties critiques avant que le flux de travail ne continue.

https://github.com/user-attachments/assets/98cb2b4e-207c-4d97-965b-4fee47c94ce8

## Déboguer au niveau des nœuds :

https://github.com/user-attachments/assets/6e82ad25-2a46-4c50-b030-415ea9994690

## Multimodal (téléverser des fichiers ou coller des URL)

PDF, vidéos, audio, images, ...

https://github.com/user-attachments/assets/83ed9a22-1ec1-4d86-9dd6-5d945588fd0b

## Boucles

<img width="1919" alt="Loops" src="https://github.com/user-attachments/assets/3aea63dc-f46f-46e9-bddd-e2af9c2a56bf" />

## RAG

### Étape 1) Créer une collection de documents (découpage + analyse)

https://github.com/user-attachments/assets/c77723b1-c076-4a64-a01d-6d6677e9c60e

### Étape 2) Créer un index vectoriel (intégration + insertion/mise à jour dans la base de données vectorielle)

https://github.com/user-attachments/assets/50e5c711-dd01-4d92-bb23-181a1c5bba25

## Blocs modulaires

https://github.com/user-attachments/assets/6442f0ad-86d8-43d9-aa70-e5c01e55e876

## Évaluer la performance finale

https://github.com/user-attachments/assets/4dc2abc3-c6e6-4d6d-a5c3-787d518de7ae

## Bientôt : Auto-amélioration

https://github.com/user-attachments/assets/5bef7a16-ef9f-4650-b385-4ea70fa54c8a

# 🛠️ Configuration de développement de PySpur
#### [ Instructions pour le développement sur des systèmes de type Unix. Le développement sur Windows/PC n'est pas supporté ]

Pour le développement, suivez ces étapes :

1. **Cloner le dépôt :**
    ```sh
    git clone https://github.com/PySpur-com/pyspur.git
    cd pyspur
    ```

2. **Lancer en utilisant docker-compose.dev.yml :**
    ```sh
    docker compose -f docker-compose.dev.yml up --build -d
    ```
    Cela démarrera une instance locale de PySpur avec le rechargement à chaud activé pour le développement.

3. **Personnaliser votre configuration :**
    Modifiez le fichier `.env` pour configurer votre environnement. Par défaut, PySpur utilise une base de données PostgreSQL locale. Pour utiliser une base de données externe, modifiez les variables `POSTGRES_*` dans le fichier `.env`.

# ⭐ Soutenez-nous

Vous pouvez nous soutenir en laissant une étoile ! Merci !

![star](https://github.com/user-attachments/assets/71f65273-6755-469d-be44-087bb89d5e76)

Vos retours seront grandement appréciés.
Veuillez nous [faire part](mailto:founders@pyspur.dev?subject=Feature%20Request&body=I%20want%20this%20feature%3Ai) des fonctionnalités de cette liste que vous souhaitez voir prochainement ou proposer de toutes nouvelles fonctionnalités.