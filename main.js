document.addEventListener('DOMContentLoaded', () => {
    // --- LIB & CONFIG SETUP ---
    const { jsmediatags } = window;
    const supabaseUrl = 'https://ogmkthzbvdyrqwmjsxsr.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbWt0aHpidmR5cnF3bWpzeHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjU0NTMsImV4cCI6MjA3NjgwMTQ1M30.kHXcO7Rewypic2qzWTBy_9LiU33aj2W2C2w_kxXeN14';
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    Telegram.WebApp.ready();

    // --- DOM ELEMENTS ---
    const dom = {
        loadingSpinner: document.getElementById('loading'),
        albumArt: document.getElementById('album-art'),
        trackTitle: document.getElementById('track-title'),
        trackArtist: document.getElementById('track-artist'),
        prevBtn: document.getElementById('prev-btn'),
        playBtn: document.getElementById('play-btn'),
        nextBtn: document.getElementById('next-btn'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        repeatBtn: document.getElementById('repeat-btn'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        currentTimeEl: document.getElementById('current-time'),
        totalDurationEl: document.getElementById('total-duration'),
        volumeSlider: document.getElementById('volume-slider'),
        playlistContainer: document.getElementById('playlist'),
        searchInput: document.getElementById('search-input'),
        adminPanel: document.getElementById('admin'),
        fileInput: document.getElementById('file-input'),
        uploadBtn: document.getElementById('upload-btn'),
        uploadProgress: document.getElementById('upload-progress'),
        visualizer: document.getElementById('visualizer')
    };

    // --- AUDIO & STATE ---
    const audio = new Audio();
    audio.crossOrigin = "Anonymous";
    let audioContext, analyser, source, dataArray, bufferLength;
    const state = {
        playlist: [],
        originalPlaylist: [],
        currentTrackIndex: 0,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none', // 'none', 'one', 'all'
    };

    // --- INITIALIZATION ---
    const init = async () => {
        showLoading(true);
        dom.adminPanel.style.display = 'block';
        await fetchPlaylist();
        setupEventListeners();
        setupVisualizer();
        showLoading(false);
    };

    // --- DATA & PLAYLIST ---
    const fetchPlaylist = async () => {
        const { data, error } = await supabaseClient.from('music').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching playlist:', error);
            return;
        }
        state.originalPlaylist = data;
        state.playlist = [...state.originalPlaylist];
        renderPlaylist();
        if (state.playlist.length > 0) {
            loadTrack(0);
        } else {
            // Handle empty playlist case
            dom.trackTitle.textContent = 'Playlist is empty';
            dom.trackArtist.textContent = 'Upload some music!';
            dom.albumArt.src = 'https://via.placeholder.com/180';
        }
    };

    const renderPlaylist = (filter = '') => {
        dom.playlistContainer.innerHTML = '';
        const lowerCaseFilter = filter.toLowerCase();
        const filteredPlaylist = state.playlist.filter(track =>
            (track.title || '').toLowerCase().includes(lowerCaseFilter) ||
            (track.artist || '').toLowerCase().includes(lowerCaseFilter)
        );

        if (filteredPlaylist.length === 0) {
            dom.playlistContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #888;">No tracks found</div>`;
            return;
        }

        filteredPlaylist.forEach(track => {
            const trackIndexInPlaylist = state.playlist.findIndex(p => p.id === track.id);
            const item = document.createElement('div');
            item.className = 'playlist-item';
            if (trackIndexInPlaylist === state.currentTrackIndex && state.isPlaying) {
                item.classList.add('active-track');
            }
            item.innerHTML = `<span>${track.title || 'Untitled'} - ${track.artist || 'Unknown'}</span>`;
            item.addEventListener('click', () => {
                loadTrack(trackIndexInPlaylist);
                playTrack();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTrack(track);
            });
            item.appendChild(deleteBtn);

            dom.playlistContainer.appendChild(item);
        });
    };

    // --- TRACK MANAGEMENT ---
    const loadTrack = (index) => {
        if (index < 0 || index >= state.playlist.length) return;
        state.currentTrackIndex = index;
        const track = state.playlist[state.currentTrackIndex];
        dom.trackTitle.textContent = track.title || 'Unknown Title';
        dom.trackArtist.textContent = track.artist || 'Unknown Artist';
        audio.src = track.url;
        dom.albumArt.src = track.album_art_url || 'https://via.placeholder.com/180';
        updateActiveTrack();
    };

    const playTrack = () => {
        if (!audio.src) return;
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        state.isPlaying = true;
        audio.play().catch(e => {
            console.error("Playback failed:", e);
            state.isPlaying = false; // Reset state on failure
        });
        dom.playBtn.textContent = '⏸️';
        dom.albumArt.classList.add('pulsing');
        updateActiveTrack();
    };

    const pauseTrack = () => {
        state.isPlaying = false;
        audio.pause();
        dom.playBtn.textContent = '▶️';
        dom.albumArt.classList.remove('pulsing');
        updateActiveTrack();
    };

    const prevTrack = () => {
        state.currentTrackIndex = (state.currentTrackIndex - 1 + state.playlist.length) % state.playlist.length;
        loadTrack(state.currentTrackIndex);
        playTrack();
    };

    const nextTrack = (forceNext = false) => {
        if (state.repeatMode === 'one' && state.isPlaying && !forceNext) {
            audio.currentTime = 0;
            audio.play();
            return;
        }

        let nextIndex;
        if (state.isShuffle) {
            nextIndex = Math.floor(Math.random() * state.playlist.length);
        } else {
            nextIndex = state.currentTrackIndex + 1;
        }

        if (nextIndex >= state.playlist.length) {
            if (state.repeatMode === 'all') {
                nextIndex = 0;
            } else {
                pauseTrack();
                loadTrack(0); // Reset to first track visually
                return;
            }
        }

        loadTrack(nextIndex);
        playTrack();
    };

    // --- UI & UX ---
    const updateProgress = () => {
        if (!audio.duration) return;
        const { duration, currentTime } = audio;
        dom.progressBar.style.width = `${(currentTime / duration) * 100}%`;
        dom.currentTimeEl.textContent = formatTime(currentTime);
        if(dom.totalDurationEl.textContent !== formatTime(duration)){
            dom.totalDurationEl.textContent = formatTime(duration);
        }
    };

    const setProgress = (e) => {
        if (!audio.duration) return;
        audio.currentTime = (e.offsetX / dom.progressContainer.clientWidth) * audio.duration;
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const updateActiveTrack = () => {
        document.querySelectorAll('.playlist-item.active-track').forEach(item => item.classList.remove('active-track'));
        const currentItem = dom.playlistContainer.children[state.currentTrackIndex];
        if (currentItem && state.isPlaying) {
            currentItem.classList.add('active-track');
        }
    };

    const showLoading = (show) => {
        dom.loadingSpinner.style.display = show ? 'block' : 'none';
    };

    // --- METADATA & UPLOAD ---
    const getFileMetadata = (file) => {
        return new Promise((resolve) => {
            jsmediatags.read(file, {
                onSuccess: (tag) => {
                    const { title, artist, picture } = tag.tags;
                    resolve({ title, artist, picture });
                },
                onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Unknown Artist', picture: null })
            });
        });
    };

    const handleUpload = async () => {
        const file = dom.fileInput.files[0];
        if (!file) return;

        showLoading(true);
        dom.uploadBtn.disabled = true;
        dom.uploadProgress.style.display = 'block';
        dom.uploadProgress.value = 0;

        const metadata = await getFileMetadata(file);
        const musicFileName = `${Date.now()}_${file.name}`;
        
        const { data: musicData, error: musicError } = await supabaseClient.storage.from('music').upload(musicFileName, file);
        if (musicError) {
            alert('Music upload failed!');
            showLoading(false);
            return;
        }
        const { data: { publicUrl: musicPublicUrl } } = supabaseClient.storage.from('music').getPublicUrl(musicFileName);

        let albumArtPublicUrl = null;
        if (metadata.picture) {
            const { data, format } = metadata.picture;
            const artFileName = `art_${Date.now()}`;
            const { error: artError } = await supabaseClient.storage.from('music').upload(artFileName, new Blob([new Uint8Array(data)], {type: format}));
            if (artError) {
                 console.warn('Album art upload failed:', artError);
            } else {
                const { data: { publicUrl } } = supabaseClient.storage.from('music').getPublicUrl(artFileName);
                albumArtPublicUrl = publicUrl;
            }
        }

        const { error: dbError } = await supabaseClient.from('music').insert([{
            title: metadata.title,
            artist: metadata.artist,
            url: musicPublicUrl,
            album_art_url: albumArtPublicUrl
        }]);

        dom.uploadBtn.disabled = false;
        dom.uploadProgress.style.display = 'none';
        showLoading(false);

        if (!dbError) {
            await fetchPlaylist();
        } 
    };

    const deleteTrack = async (track) => {
        if (!confirm(`Are you sure you want to delete "${track.title}"?`)) return;
        showLoading(true);

        const filesToDelete = [track.url.split('/').pop()];
        if (track.album_art_url && track.album_art_url.includes(supabaseUrl)) {
            filesToDelete.push(track.album_art_url.split('/').pop());
        }

        await supabaseClient.storage.from('music').remove(filesToDelete);
        await supabaseClient.from('music').delete().match({ id: track.id });

        const deletedTrackIndex = state.originalPlaylist.findIndex(t => t.id === track.id);
        
        if (audio.src === track.url) {
            pauseTrack();
            audio.src = null;
            dom.trackTitle.textContent = '';
            dom.trackArtist.textContent = '';
            dom.albumArt.src = 'https://via.placeholder.com/180';
            updateProgress();
        }

        await fetchPlaylist();

        // If the deleted track was before the current one, adjust index
        if(deletedTrackIndex < state.currentTrackIndex){
            state.currentTrackIndex--;
        }
        
        showLoading(false);
    };

    // --- VISUALIZER ---
    function setupVisualizer() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
            analyser.fftSize = 256;
            bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            drawVisualizer();
        } catch (e) {
            dom.visualizer.style.display = 'none';
        }
    }

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);
        if (!analyser || !state.isPlaying) {
            dom.visualizer.getContext('2d').clearRect(0, 0, dom.visualizer.width, dom.visualizer.height);
            return;
        }
        analyser.getByteFrequencyData(dataArray);
        const ctx = dom.visualizer.getContext('2d');
        ctx.clearRect(0, 0, dom.visualizer.width, dom.visualizer.height);
        const barWidth = (dom.visualizer.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 1.5;
            const gradient = ctx.createLinearGradient(0, 0, 0, dom.visualizer.height);
            gradient.addColorStop(1, '#1db954');
            gradient.addColorStop(0.5, '#5cff9d');
            gradient.addColorStop(0, '#ffffff');
            ctx.fillStyle = gradient;
            ctx.fillRect(x, dom.visualizer.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        dom.playBtn.addEventListener('click', () => state.isPlaying ? pauseTrack() : playTrack());
        dom.prevBtn.addEventListener('click', prevTrack);
        dom.nextBtn.addEventListener('click', ()=> nextTrack(true));
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress);
        audio.addEventListener('ended', () => nextTrack(false));
        dom.progressContainer.addEventListener('click', setProgress);
        dom.uploadBtn.addEventListener('click', handleUpload);
        dom.searchInput.addEventListener('input', (e) => renderPlaylist(e.target.value));
        dom.volumeSlider.addEventListener('input', (e) => audio.volume = e.target.value);
        dom.shuffleBtn.addEventListener('click', () => {
            state.isShuffle = !state.isShuffle;
            dom.shuffleBtn.classList.toggle('active', state.isShuffle);
            state.playlist = state.isShuffle ? [...state.originalPlaylist].sort(() => Math.random() - 0.5) : [...state.originalPlaylist];
            renderPlaylist();
        });
        dom.repeatBtn.addEventListener('click', () => {
            const modes = ['none', 'all', 'one'];
            const currentModeIndex = modes.indexOf(state.repeatMode);
            state.repeatMode = modes[(currentModeIndex + 1) % modes.length];
            dom.repeatBtn.classList.toggle('active', state.repeatMode !== 'none');
            dom.repeatBtn.textContent = state.repeatMode === 'one' ? '🔂' : '🔁';
        });
    };

    init();
});
