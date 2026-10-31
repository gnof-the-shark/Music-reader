const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac"];
const AUDIO_CACHE_NAME = "music-reader-audio-v1";

const statusElement = document.getElementById("status");
const playlistElement = document.getElementById("playlist");
function ensureOfflineDownloadButton() {
  const existingButton = document.getElementById("offline-download");
  if (existingButton) {
    return existingButton;
  }

  const fallbackButton = document.createElement("button");
  fallbackButton.id = "offline-download";
  fallbackButton.type = "button";
  fallbackButton.disabled = true;
  fallbackButton.textContent = "Télécharger pour lecture hors-ligne";
  statusElement.insertAdjacentElement("afterend", fallbackButton);
  return fallbackButton;
}

const offlineDownloadButton = ensureOfflineDownloadButton();
let availableFiles = [];
let isOfflineCaching = false;

function isAudioFile(fileName) {
  const lowerName = fileName.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

function getRepositoryContext() {
  const root = document.documentElement.dataset;
  const configuredOwner = root.githubOwner;
  const configuredRepo = root.githubRepo;

  if (configuredOwner && configuredRepo) {
    return { owner: configuredOwner, repo: configuredRepo };
  }

  const hostName = window.location.hostname.toLowerCase();
  if (!hostName.endsWith(".github.io")) {
    return null;
  }

  const owner = hostName.split(".")[0];
  const repo = window.location.pathname.split("/").filter(Boolean)[0];

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function setStatus(text) {
  statusElement.textContent = text;
}

function getLocalAudioPath(file) {
  const encodedPath = file.path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `./${encodedPath}`;
}

function updateOfflineButtonState() {
  if (!offlineDownloadButton) {
    return;
  }

  offlineDownloadButton.disabled = isOfflineCaching || availableFiles.length === 0;
}

async function cacheFilesForOffline() {
  if (!("caches" in window)) {
    setStatus("Le cache hors-ligne n'est pas pris en charge sur ce navigateur.");
    return;
  }

  if (availableFiles.length === 0 || isOfflineCaching) {
    return;
  }

  isOfflineCaching = true;
  updateOfflineButtonState();
  setStatus(`Téléchargement hors-ligne de ${availableFiles.length} piste(s) en cours…`);

  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);

    for (const file of availableFiles) {
      await cache.add(getLocalAudioPath(file));
    }

    setStatus(`${availableFiles.length} piste(s) prête(s) pour lecture hors-ligne.`);
  } catch (error) {
    console.error(error);
    setStatus("Échec du téléchargement hors-ligne. Vérifie ta connexion Wi-Fi et réessaie.");
  } finally {
    isOfflineCaching = false;
    updateOfflineButtonState();
  }
}

function createRepeatButton(player) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "repeat-toggle";
  player.loop = true;
  button.setAttribute("aria-pressed", "true");
  button.textContent = "🔁 Relecture: activée";

  button.addEventListener("click", () => {
    player.loop = !player.loop;
    button.setAttribute("aria-pressed", String(player.loop));
    button.textContent = player.loop ? "🔁 Relecture: activée" : "🔁 Relecture: désactivée";
  });

  return button;
}

function renderPlaylist(files) {
  playlistElement.innerHTML = "";

  for (const file of files) {
    const item = document.createElement("li");
    const title = document.createElement("h2");
    const player = document.createElement("audio");
    const repeatButton = createRepeatButton(player);

    title.textContent = file.name;
    player.controls = true;
    player.preload = "none";
    player.src = getLocalAudioPath(file);

    item.append(title, repeatButton, player);
    playlistElement.appendChild(item);
  }
}

async function loadMusicFiles() {
  const context = getRepositoryContext();

  if (!context) {
    setStatus("Impossible de détecter le dépôt GitHub automatiquement.");
    return;
  }

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/musique`
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const entries = await response.json();
  const files = entries
    .filter((entry) => entry.type === "file" && isAudioFile(entry.name) && entry.download_url)
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  if (files.length === 0) {
    availableFiles = [];
    updateOfflineButtonState();
    setStatus("Aucun fichier audio trouvé dans le dossier musique/. ");
    return;
  }

  availableFiles = files;
  updateOfflineButtonState();
  renderPlaylist(files);
  setStatus(`${files.length} fichier(s) audio détecté(s).`);
}

if (offlineDownloadButton) {
  offlineDownloadButton.addEventListener("click", () => {
    cacheFilesForOffline();
  });
}

loadMusicFiles().catch((error) => {
  console.error(error);
  availableFiles = [];
  updateOfflineButtonState();
  setStatus("Erreur pendant le chargement. Vérifie que le dossier musique/ existe et que le dépôt est public.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
