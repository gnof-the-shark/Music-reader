const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac"];

const statusElement = document.getElementById("status");
const playlistElement = document.getElementById("playlist");

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

  if (!window.location.hostname.endsWith("github.io")) {
    return null;
  }

  const owner = window.location.hostname.split(".")[0];
  const repo = window.location.pathname.split("/").filter(Boolean)[0];

  if (!owner || !repo) {
    return null;
  }

  return { owner, repo };
}

function setStatus(text) {
  statusElement.textContent = text;
}

function renderPlaylist(files) {
  playlistElement.innerHTML = "";

  for (const file of files) {
    const item = document.createElement("li");
    const title = document.createElement("h2");
    const player = document.createElement("audio");

    title.textContent = file.name;
    player.controls = true;
    player.preload = "none";
    player.src = file.download_url;

    item.append(title, player);
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
    setStatus("Aucun fichier audio trouvé dans le dossier musique/. ");
    return;
  }

  renderPlaylist(files);
  setStatus(`${files.length} fichier(s) audio détecté(s).`);
}

loadMusicFiles().catch((error) => {
  console.error(error);
  setStatus("Erreur pendant le chargement. Vérifie que le dossier musique/ existe et que le dépôt est public.");
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}
