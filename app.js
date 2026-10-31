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
let playlistPlayers = [];
let currentTrackIndex = -1;

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

function normalizeTrackIndex(index) {
  if (playlistPlayers.length === 0) {
    return -1;
  }

  return ((index % playlistPlayers.length) + playlistPlayers.length) % playlistPlayers.length;
}

function updateMediaSessionState(index) {
  if (!("mediaSession" in navigator)) {
    return;
  }

  const mediaSession = navigator.mediaSession;
  const safeIndex = normalizeTrackIndex(index);

  if (safeIndex === -1) {
    mediaSession.playbackState = "none";
    return;
  }

  const player = playlistPlayers[safeIndex];
  const file = availableFiles[safeIndex];

  if ("MediaMetadata" in window && file) {
    mediaSession.metadata = new MediaMetadata({
      title: file.name,
      artist: "Music-reader",
      album: "Ruelle Hantée",
    });
  }

  mediaSession.playbackState = player.paused ? "paused" : "playing";
}

function pauseOtherPlayers(activeIndex) {
  playlistPlayers.forEach((player, index) => {
    if (index !== activeIndex && !player.paused) {
      player.pause();
    }
  });
}

function playTrackAt(index) {
  const safeIndex = normalizeTrackIndex(index);
  if (safeIndex === -1) {
    return;
  }

  currentTrackIndex = safeIndex;
  pauseOtherPlayers(safeIndex);
  updateMediaSessionState(safeIndex);
  const player = playlistPlayers[safeIndex];
  const playPromise = player.play();

  if (playPromise && typeof playPromise.catch === "function") {
    playPromise.catch((error) => {
      console.error("Impossible de lancer la lecture", error);
    });
  }
}

function playNextTrack() {
  if (playlistPlayers.length === 0) {
    return;
  }

  const startIndex = currentTrackIndex === -1 ? 0 : currentTrackIndex + 1;
  playTrackAt(startIndex);
}

function playPreviousTrack() {
  if (playlistPlayers.length === 0) {
    return;
  }

  const startIndex = currentTrackIndex === -1 ? playlistPlayers.length - 1 : currentTrackIndex - 1;
  playTrackAt(startIndex);
}

function setMediaSessionHandler(action, handler) {
  if (!("mediaSession" in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch (error) {
    console.warn(`Action media session non prise en charge: ${action}`, error);
  }
}

function setupMediaSessionControls() {
  setMediaSessionHandler("nexttrack", () => {
    playNextTrack();
  });

  setMediaSessionHandler("previoustrack", () => {
    playPreviousTrack();
  });

  setMediaSessionHandler("play", () => {
    if (currentTrackIndex === -1) {
      playTrackAt(0);
      return;
    }

    const player = playlistPlayers[currentTrackIndex];
    player.play().catch((error) => {
      console.error("Impossible de reprendre la lecture", error);
    });
  });

  setMediaSessionHandler("pause", () => {
    if (currentTrackIndex === -1) {
      return;
    }

    playlistPlayers[currentTrackIndex].pause();
  });
}

function renderPlaylist(files) {
  playlistElement.innerHTML = "";
  playlistPlayers = [];
  currentTrackIndex = -1;

  files.forEach((file, index) => {
    const item = document.createElement("li");
    const title = document.createElement("h2");
    const player = document.createElement("audio");
    const repeatButton = createRepeatButton(player);

    title.textContent = file.name;
    player.controls = true;
    player.preload = "none";
    player.src = getLocalAudioPath(file);
    player.addEventListener("play", () => {
      currentTrackIndex = index;
      pauseOtherPlayers(index);
      updateMediaSessionState(index);
    });
    player.addEventListener("pause", () => {
      if (currentTrackIndex === index) {
        updateMediaSessionState(index);
      }
    });

    item.append(title, repeatButton, player);
    playlistElement.appendChild(item);
    playlistPlayers.push(player);
  });

  setupMediaSessionControls();
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
