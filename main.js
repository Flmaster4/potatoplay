document.addEventListener('DOMContentLoaded', () => {
    // --- SUPABASE & TELEGRAM SETUP ---
    const supabaseUrl = 'https.ogmkthzbvdyrqwmjsxsr.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbWt0aHpidmR5cnF3bWpzeHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjU0NTMsImV4cCI6MjA3NjgwMTQ1M30.kHXcO7Rewypic2qzWTBy_9LiU33aj2W2C2w_kxXeN14';
    const supabase = supabase.createClient(supabaseUrl, supabaseKey);
    Telegram.WebApp.ready();

    // --- DOM ELEMENTS ---
    const loadingSpinner = document.getElementById('loading');
    const albumArt = document.getElementById('album-art');
    const trackTitle = document.getElementById('track-title');
    const trackArtist = document.getElementById('track-artist');
    const prevBtn = document.getElementById('prev-btn');
    const playBtn = document.getElementById('play-btn');
    const nextBtn = document.getElementById('next-btn');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const repeatBtn = document.getElementById('repeat-btn');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const currentTimeEl = document.getElementById('current-time');
    const totalDurationEl = document.getElementById('total-duration');
    const volumeSlider = document.getElementById('volume-slider');
    const playlistContainer = document.getElementById('playlist');
    const searchInput = document.getElementById('search-input');
    const adminPanel = document.getElementById('admin');
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadProgress = document.getElementById('upload-progress');
    const visualizer = document.getElementById('visualizer');

    // --- AUDIO & STATE ---
    let audio = new Audio();
    audio.crossOrigin = "Anonymous"; // Required for visualizer
    let audioContext, analyser, source, dataArray, bufferLength;
    let playlist = [];
    let originalPlaylist = [];
    let currentTrackIndex = 0;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 'none'; // 'none', 'one', 'all'

    // --- INITIALIZATION ---
    const init = async () => {
        showLoading(true);
        // Always show admin panel for all users
        adminPanel.style.display = 'block';
        
        await fetchPlaylist();
        setupEventListeners();
        setupVisualizer();
        showLoading(false);
    };

    // --- DATA & PLAYLIST ---
    const fetchPlaylist = async () => {
        const { data, error } = await supabase.from('music').select('*').order('created_at', { ascending: false });
        if (error) {
            console.error('Error fetching playlist:', error);
            return;
        }
        originalPlaylist = data;
        playlist = [...originalPlaylist];
        renderPlaylist();
        if (playlist.length > 0) {
            loadTrack(0);
        }
    };

    const renderPlaylist = (filter = '') => {
        playlistContainer.innerHTML = '';
        const filteredPlaylist = playlist.filter(track => 
            (track.title || '').toLowerCase().includes(filter.toLowerCase()) || 
            (track.artist || '').toLowerCase().includes(filter.toLowerCase())
        );

        filteredPlaylist.forEach((track) => {
            const trackIndexInPlaylist = playlist.findIndex(p => p.id === track.id);
            const item = document.createElement('div');
            item.className = 'playlist-item';
            if (trackIndexInPlaylist === currentTrackIndex && isPlaying) {
                item.classList.add('active-track');
            }
            item.innerHTML = `<span>${track.title || 'Untitled'} - ${track.artist || 'Unknown'}</span>`;
            item.addEventListener('click', () => {
                loadTrack(trackIndexInPlaylist);
                playTrack();
            });
            
            // Always show delete button for all users
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '🗑️';
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTrack(track.id, track.url);
            });
            item.appendChild(deleteBtn);
            
            playlistContainer.appendChild(item);
        });
    };

    // --- TRACK MANAGEMENT ---
    const loadTrack = (index) => {
        currentTrackIndex = index;
        const track = playlist[currentTrackIndex];
        trackTitle.textContent = track.title || 'Unknown Title';
        trackArtist.textContent = track.artist || 'Unknown Artist';
        audio.src = track.url;
        albumArt.src = track.album_art_url || 'https://via.placeholder.com/180'; // Placeholder
        updateActiveTrack();
    };

    const playTrack = () => {
        if (!audio.src) return;
        // Resume AudioContext on user interaction
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        isPlaying = true;
        audio.play().catch(e => console.error("Playback failed:", e));
        playBtn.textContent = '⏸️';
        updateActiveTrack();
    };

    const pauseTrack = () => {
        isPlaying = false;
        audio.pause();
        playBtn.textContent = '▶️';
        updateActiveTrack();
    };

    const prevTrack = () => {
        currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        loadTrack(currentTrackIndex);
        playTrack();
    };

    const nextTrack = () => {
        if (repeatMode === 'one' && isPlaying) {
             audio.currentTime = 0;
             audio.play();
             return;
        }

        if (isShuffle) {
            currentTrackIndex = Math.floor(Math.random() * playlist.length);
        } else {
            currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
        }
        
        if (repeatMode !== 'all' && !isShuffle && currentTrackIndex === 0 && !audio.loop) {
            // If it's the end of the playlist and not on repeat all or shuffle, stop playing
            if(playlist.indexOf(playlist[currentTrackIndex]) === playlist.length - 1) {
                 pauseTrack();
                 return;
             }
        }

        loadTrack(currentTrackIndex);
        playTrack();
    };

    // --- UI & UX ---
    const updateProgress = () => {
        if (!audio.duration) return;
        const { duration, currentTime } = audio;
        const progressPercent = (currentTime / duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        totalDurationEl.textContent = formatTime(duration);
    };

    const setProgress = (e) => {
        const width = progressContainer.clientWidth;
        const clickX = e.offsetX;
        audio.currentTime = (clickX / width) * audio.duration;
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const updateActiveTrack = () => {
        document.querySelectorAll('.playlist-item.active-track').forEach(item => {
            item.classList.remove('active-track');
        });
        const currentItem = Array.from(playlistContainer.children).find(child => playlist[currentTrackIndex] && child.innerHTML.includes(playlist[currentTrackIndex].title));
        if (currentItem && isPlaying) {
            currentItem.classList.add('active-track');
        }
    };

    const showLoading = (show) => {
        loadingSpinner.style.display = show ? 'block' : 'none';
    };

    // --- ADMIN FUNCTIONS ---
    const handleUpload = async () => {
        const file = fileInput.files[0];
        if (!file) return;

        uploadBtn.disabled = true;
        uploadProgress.style.display = 'block';
        uploadProgress.value = 0;

        const fileName = `${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('music').upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
        });

        uploadBtn.disabled = false;
        uploadProgress.style.display = 'none';

        if (error) {
            console.error('Error uploading file:', error);
            alert('Upload failed!');
            return;
        }

        const { data: { publicUrl } } = supabase.storage.from('music').getPublicUrl(fileName);
        const [title, artist] = file.name.replace(/\.mp3|\.wav|\.ogg/g, '').split(' - ');

        const { error: dbError } = await supabase.from('music').insert([{
            title: title || 'Unknown Title',
            artist: artist || 'Unknown Artist',
            url: publicUrl,
        }]);

        if (dbError) {
            console.error('Error saving to database:', dbError);
        } else {
            await fetchPlaylist();
        }
    };

    const deleteTrack = async (id, url) => {
        if (!confirm('Are you sure you want to delete this track?')) return;

        showLoading(true);
        // Delete from DB
        const { error: dbError } = await supabase.from('music').delete().match({ id });
        if (dbError) {
            console.error('Error deleting from DB:', dbError);
            showLoading(false);
            return;
        }

        // Delete from Storage
        const fileName = url.split('/').pop();
        const { error: storageError } = await supabase.storage.from('music').remove([fileName]);
        if (storageError) {
            console.error('Error deleting from Storage:', storageError);
        }

        // Stop playing if the deleted track was the one playing
        if (audio.src === url) {
            pauseTrack();
            audio.src = null;
            trackTitle.textContent = '';
            trackArtist.textContent = '';
            albumArt.src = 'https://via.placeholder.com/180';
            updateProgress(); // Resets progress bar
        }

        await fetchPlaylist();
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
            console.error("AudioContext not supported or failed to initialize:", e);
            visualizer.style.display = 'none';
        }
    }

    function drawVisualizer() {
        requestAnimationFrame(drawVisualizer);
        if (!analyser || !isPlaying) {
             const canvasCtx = visualizer.getContext('2d');
            canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);
            return;
        };
        
        analyser.getByteFrequencyData(dataArray);
        const canvasCtx = visualizer.getContext('2d');
        canvasCtx.clearRect(0, 0, visualizer.width, visualizer.height);
        const barWidth = (visualizer.width / bufferLength) * 2.5;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2;
            const gradient = canvasCtx.createLinearGradient(0, 0, 0, visualizer.height);
            gradient.addColorStop(1, '#1db954');
            gradient.addColorStop(0.5, '#5cff9d');
            gradient.addColorStop(0, '#ffffff');
            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, visualizer.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        playBtn.addEventListener('click', () => isPlaying ? pauseTrack() : playTrack());
        prevBtn.addEventListener('click', prevTrack);
        nextBtn.addEventListener('click', nextTrack);
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress); 
        audio.addEventListener('ended', nextTrack);
        progressContainer.addEventListener('click', setProgress);
        uploadBtn.addEventListener('click', handleUpload);
        searchInput.addEventListener('input', (e) => renderPlaylist(e.target.value));
        volumeSlider.addEventListener('input', (e) => audio.volume = e.target.value);

        shuffleBtn.addEventListener('click', () => {
            isShuffle = !isShuffle;
            shuffleBtn.classList.toggle('active', isShuffle);
            if(isShuffle) {
                // Shuffle the original list and create a new playlist
                let shuffled = [...originalPlaylist].sort(() => Math.random() - 0.5);
                playlist = shuffled;
            } else {
                // Return to the original order
                playlist = [...originalPlaylist];
            }
            renderPlaylist();
        });

        repeatBtn.addEventListener('click', () => {
            if (repeatMode === 'none') {
                repeatMode = 'all';
                repeatBtn.classList.add('active');
                repeatBtn.textContent = '🔁';
            } else if (repeatMode === 'all') {
                repeatMode = 'one';
                repeatBtn.textContent = '🔂';
            } else {
                repeatMode = 'none';
                repeatBtn.classList.remove('active');
                repeatBtn.textContent = '🔁';
            }
        });
    };

    // --- START THE APP ---
    init();
});
