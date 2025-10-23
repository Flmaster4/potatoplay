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
        playBtn: document.getElementById('play-btn'),
        playBtnIcon: document.querySelector('#play-btn i'),
        prevBtn: document.getElementById('prev-btn'),
        nextBtn: document.getElementById('next-btn'),
        shuffleBtn: document.getElementById('shuffle-btn'),
        repeatBtn: document.getElementById('repeat-btn'),
        progressContainer: document.getElementById('progress-container'),
        progressBar: document.getElementById('progress-bar'),
        currentTimeEl: document.getElementById('current-time'),
        totalDurationEl: document.getElementById('total-duration'),
        playlistContainer: document.getElementById('playlist'),
        volumeSlider: document.getElementById('volume-slider'),
        searchFavoritesInput: document.getElementById('search-favorites-input'),
        favoritesList: document.getElementById('favorites-list'),
        uploadArea: document.getElementById('upload-area'),
        fileInput: document.getElementById('file-input'),
        fileNameEl: document.getElementById('file-name'),
        uploadBtn: document.getElementById('upload-btn'),
        uploadProgress: document.getElementById('upload-progress'),
        navBar: document.getElementById('nav-bar'),
        pages: document.querySelectorAll('.page'),
    };

    // --- AUDIO & STATE ---
    const audio = new Audio();
    const state = {
        playlist: [],
        originalPlaylist: [],
        favorites: [], // Will be fetched from Supabase
        currentTrackIndex: 0,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none', // 'none', 'one', 'all'
        selectedFile: null,
        user: Telegram.WebApp.initDataUnsafe?.user || null,
    };

    // --- INITIALIZATION ---
    const init = async () => {
        showLoading(true);
        await upsertUser(); // Ensure user exists before fetching their data
        await Promise.all([fetchPlaylist(), fetchFavorites()]);
        setupEventListeners();
        dom.uploadBtn.disabled = true;
        dom.uploadProgress.style.display = 'none';
        audio.volume = dom.volumeSlider.value;
        showLoading(false);
    };

    // --- USER MANAGEMENT ---
    const upsertUser = async () => {
        if (!state.user) {
            console.warn("User data not available from Telegram.");
            return;
        }
        const { error } = await supabaseClient.from('users').upsert({
            id: state.user.id,
            first_name: state.user.first_name,
            last_name: state.user.last_name,
            username: state.user.username
        }, { onConflict: 'id' });

        if (error) {
            console.error("Error upserting user:", error);
        }
    };

    // --- NAVIGATION ---
    const handleNavigation = (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.nav-item');
        if (!targetItem) return; 
        const pageName = targetItem.dataset.page;
        if (!pageName) return;

        dom.pages.forEach(page => page.classList.add('hidden'));
        document.getElementById(pageName).classList.remove('hidden');

        dom.navBar.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active', 'text-green-500');
            item.classList.add('text-gray-400');
        });
        targetItem.classList.add('active', 'text-green-500');
        targetItem.classList.remove('text-gray-400');

        if (pageName === 'page-favorites') {
            renderFavorites();
        }
    };

    // --- DATA FETCHING ---
    const fetchPlaylist = async () => {
        const { data, error } = await supabaseClient.from('music').select('*').order('created_at', { ascending: false });
        if (error) { console.error('Ошибка загрузки плейлиста:', error); return; }
        state.originalPlaylist = data;
        state.playlist = [...state.originalPlaylist];
        renderPlaylist();
        if (state.playlist.length > 0) loadTrack(0);
    };

    const fetchFavorites = async () => {
        if (!state.user) return;
        const { data, error } = await supabaseClient.from('favorites').select('track_id').eq('user_id', state.user.id);
        if (error) {
            console.error('Ошибка загрузки избранного:', error);
            state.favorites = [];
            return;
        }
        state.favorites = data.map(fav => fav.track_id);
    };

    // --- RENDERING ---
    const renderPlaylist = () => {
        dom.playlistContainer.innerHTML = '';
        if (state.playlist.length === 0) {
            dom.playlistContainer.innerHTML = `<div class="text-center p-4 text-gray-500">Треки не найдены.</div>`;
            return;
        }

        state.playlist.forEach((track, index) => {
            const isFavorite = state.favorites.includes(track.id);
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            if (index === state.currentTrackIndex) item.classList.add('bg-gray-800');

            item.innerHTML = `
                <div class="flex items-center space-x-4 overflow-hidden">
                    <img src="${track.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-md flex-shrink-0"/>
                    <div class="truncate">
                        <div class="font-semibold truncate ${index === state.currentTrackIndex && state.isPlaying ? 'text-green-400' : ''}">${track.title || 'Без названия'}</div>
                        <div class="text-sm text-gray-400 truncate">${track.artist || 'Неизвестен'}</div>
                    </div>
                </div>
                <div class="flex items-center flex-shrink-0">
                     <button class="favorite-btn text-gray-500 hover:text-red-500 transition p-2" data-track-id="${track.id}">
                        <i class="${isFavorite ? 'fas' : 'far'} fa-heart"></i>
                    </button>
                    <button class="delete-btn text-gray-500 hover:text-red-500 transition p-2"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;

            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-btn') || e.target.closest('.favorite-btn')) return;
                loadTrack(index);
                playTrack();
            });

            item.querySelector('.delete-btn').addEventListener('click', () => deleteTrack(track));
            item.querySelector('.favorite-btn').addEventListener('click', () => toggleFavorite(track.id));

            dom.playlistContainer.appendChild(item);
        });
    };

    const renderFavorites = (filter = '') => {
        dom.favoritesList.innerHTML = '';
        const favoriteTracks = state.originalPlaylist.filter(track => 
            state.favorites.includes(track.id) &&
            ((track.title || '').toLowerCase().includes(filter) || (track.artist || '').toLowerCase().includes(filter))
        );

        if (favoriteTracks.length === 0) {
            dom.favoritesList.innerHTML = `<div class="flex flex-col items-center text-center text-gray-500 mt-16"><i class="fas fa-heart-broken text-6xl mb-4"></i><p class="text-lg">Вы еще не добавили треки в избранное.</p></div>`;
            return;
        }

        favoriteTracks.forEach(track => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            item.innerHTML = `
                <div class="flex items-center space-x-4 overflow-hidden">
                    <img src="${track.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-md flex-shrink-0"/>
                    <div class="truncate">
                        <div class="font-semibold truncate">${track.title || 'Без названия'}</div>
                        <div class="text-sm text-gray-400 truncate">${track.artist || 'Неизвестен'}</div>
                    </div>
                </div>
                <button class="favorite-btn text-red-500 p-2" data-track-id="${track.id}"><i class="fas fa-heart"></i></button>
            `;
            item.addEventListener('click', (e) => {
                 if (e.target.closest('.favorite-btn')) {
                    toggleFavorite(track.id);
                    renderFavorites(dom.searchFavoritesInput.value.toLowerCase());
                } else {
                     const trackIndex = state.playlist.findIndex(p => p.id === track.id);
                     if(trackIndex !== -1) loadTrack(trackIndex);
                     playTrack();
                     document.querySelector('.nav-item[data-page="page-player"]').click();
                }
            });
            dom.favoritesList.appendChild(item);
        });
    };

    // --- FAVORITES LOGIC ---
    const toggleFavorite = async (trackId) => {
        if (!state.user) { alert('Не удалось определить пользователя.'); return; }
        const isFavorite = state.favorites.includes(trackId);
        showLoading(true);

        if (isFavorite) {
            const { error } = await supabaseClient.from('favorites').delete().match({ user_id: state.user.id, track_id: trackId });
            if (error) {
                console.error('Ошибка удаления из избранного:', error);
            } else {
                state.favorites = state.favorites.filter(id => id !== trackId);
            }
        } else {
            const { error } = await supabaseClient.from('favorites').insert([{ user_id: state.user.id, track_id: trackId }]);
            if (error) {
                 console.error('Ошибка добавления в избранное:', error);
            } else {
                state.favorites.push(trackId);
            }
        }
        showLoading(false);
        renderPlaylist();
        if (!document.getElementById('page-favorites').classList.contains('hidden')) {
            renderFavorites(dom.searchFavoritesInput.value.toLowerCase());
        }
    };

    // --- TRACK MANAGEMENT ---
    const loadTrack = (index) => {
        if (index < 0 || index >= state.playlist.length) return;
        state.currentTrackIndex = index;
        const track = state.playlist[index];
        dom.trackTitle.textContent = track.title || 'Без названия';
        dom.trackArtist.textContent = track.artist || 'Неизвестен';
        audio.src = track.url;
        dom.albumArt.src = track.album_art_url || 'https://via.placeholder.com/300';
        renderPlaylist();
    };

    const playTrack = () => {
        if (!audio.src) return;
        audio.play().then(() => {
            state.isPlaying = true;
            dom.playBtnIcon.classList.replace('fa-play-circle', 'fa-pause-circle');
            dom.albumArt.classList.add('pulsing');
            renderPlaylist();
        }).catch(e => console.error("Ошибка воспроизведения:", e));
    };

    const pauseTrack = () => {
        state.isPlaying = false;
        audio.pause();
        dom.playBtnIcon.classList.replace('fa-pause-circle', 'fa-play-circle');
        dom.albumArt.classList.remove('pulsing');
        renderPlaylist();
    };

     const prevTrack = () => {
        let newIndex = state.isShuffle 
            ? Math.floor(Math.random() * state.playlist.length)
            : (state.currentTrackIndex - 1 + state.playlist.length) % state.playlist.length;
        loadTrack(newIndex);
        playTrack();
    };

    const nextTrack = (force = false) => {
        if (state.repeatMode === 'one' && !force) { audio.currentTime = 0; playTrack(); return; }
        let newIndex = state.isShuffle ? Math.floor(Math.random() * state.playlist.length) : state.currentTrackIndex + 1;
        if (newIndex >= state.playlist.length) {
            if (state.repeatMode === 'all') newIndex = 0;
            else { pauseTrack(); loadTrack(0); return; }
        }
        loadTrack(newIndex);
        playTrack();
    };

    // --- UI & UX ---
    const updateProgress = () => {
        if (!audio.duration) return;
        const { duration, currentTime } = audio;
        dom.progressBar.style.width = `${(currentTime / duration) * 100}%`;
        dom.currentTimeEl.textContent = formatTime(currentTime);
        if (dom.totalDurationEl.textContent !== formatTime(duration)) {
            dom.totalDurationEl.textContent = formatTime(duration);
        }
    };

    const setProgress = (e) => {
        if (!audio.duration) return;
        audio.currentTime = (e.offsetX / dom.progressContainer.clientWidth) * audio.duration;
    };

    const formatTime = (seconds) => {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const showLoading = (show) => dom.loadingSpinner.classList.toggle('hidden', !show);

    // --- UPLOAD & METADATA ---
    const getFileMetadata = (file) => {
        return new Promise(resolve => {
            jsmediatags.read(file, {
                onSuccess: ({ tags }) => resolve({ title: tags.title, artist: tags.artist, picture: tags.picture }),
                onError: () => resolve({ title: file.name.replace(/\.[^/.]+$/, ""), artist: 'Неизвестен', picture: null })
            });
        });
    };

    const handleUpload = async () => {
        if (!state.selectedFile) return;
        showLoading(true);
        dom.uploadBtn.disabled = true;
        dom.uploadProgress.style.display = 'block';
        dom.uploadProgress.value = 0;

        const metadata = await getFileMetadata(state.selectedFile);
        const musicFileName = `${Date.now()}_${state.selectedFile.name}`;

        // --- FIX: Explicitly set content type for upload ---
        const { error: musicError } = await supabaseClient.storage.from('music').upload(musicFileName, state.selectedFile, {
            cacheControl: '3600',
            upsert: false,
            contentType: state.selectedFile.type || 'audio/mpeg'
        });
        
        if (musicError) { 
            alert('Ошибка загрузки файла! Убедитесь, что RLS разрешает загрузку.'); 
            console.error(musicError);
            showLoading(false); 
            return; 
        }

        const { data: { publicUrl: musicPublicUrl } } = supabaseClient.storage.from('music').getPublicUrl(musicFileName);
        let albumArtPublicUrl = null;

        if (metadata.picture) {
            const { data, format } = metadata.picture;
            const artFileName = `art_${Date.now()}`;
            const { error: artError } = await supabaseClient.storage.from('music').upload(artFileName, new Blob([new Uint8Array(data)], { type: format }), { contentType: format });
            if (!artError) {
                const { data: { publicUrl } } = supabaseClient.storage.from('music').getPublicUrl(artFileName);
                albumArtPublicUrl = publicUrl;
            }
        }

        const { error: dbError } = await supabaseClient.from('music').insert([{ title: metadata.title, artist: metadata.artist, url: musicPublicUrl, album_art_url: albumArtPublicUrl }]);
        if (!dbError) await fetchPlaylist();

        showLoading(false);
        dom.uploadProgress.style.display = 'none';
        if(dom.fileNameEl) dom.fileNameEl.textContent = '';
        state.selectedFile = null;
    };

    const deleteTrack = async (track) => {
        if (!confirm(`Удалить трек "${track.title}"?`)) return;
        showLoading(true);

        // All favorites for this track will be deleted automatically by CASCADE constraint

        // Delete from storage
        const filesToDelete = [track.url.split('/').pop()];
        if (track.album_art_url && track.album_art_url.includes(supabaseUrl)) {
            filesToDelete.push(track.album_art_url.split('/').pop());
        }
        await supabaseClient.storage.from('music').remove(filesToDelete);
        
        // Delete from music table (which will cascade to favorites)
        await supabaseClient.from('music').delete().match({ id: track.id });

        if (audio.src === track.url) pauseTrack();
        await fetchPlaylist(); // This will re-render everything correctly
        showLoading(false);
    };

    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        dom.playBtn.addEventListener('click', () => state.isPlaying ? pauseTrack() : playTrack());
        dom.prevBtn.addEventListener('click', prevTrack);
        dom.nextBtn.addEventListener('click', () => nextTrack(true));
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress);
        audio.addEventListener('ended', () => nextTrack(false));
        dom.progressContainer.addEventListener('click', setProgress);
        dom.volumeSlider.addEventListener('input', (e) => audio.volume = e.target.value);
        dom.navBar.addEventListener('click', handleNavigation);
        dom.searchFavoritesInput.addEventListener('input', (e) => renderFavorites(e.target.value.toLowerCase()));

        dom.shuffleBtn.addEventListener('click', () => {
            state.isShuffle = !state.isShuffle;
            dom.shuffleBtn.classList.toggle('text-green-500', state.isShuffle);
            dom.shuffleBtn.classList.toggle('text-gray-400', !state.isShuffle);
            state.playlist = state.isShuffle ? [...state.originalPlaylist].sort(() => 0.5 - Math.random()) : [...state.originalPlaylist];
            renderPlaylist();
        });

        dom.repeatBtn.addEventListener('click', () => {
            const modes = ['none', 'all', 'one'];
            state.repeatMode = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
            const icon = dom.repeatBtn.querySelector('i');
            icon.classList.toggle('fa-retweet', state.repeatMode === 'one'); // Using a different icon for 'one'
            dom.repeatBtn.classList.toggle('text-green-500', state.repeatMode !== 'none');
            dom.repeatBtn.classList.toggle('text-gray-400', state.repeatMode === 'none');
        });

        const handleFileSelect = (file) => {
            if (file && file.type.startsWith('audio/')) {
                state.selectedFile = file;
                if(dom.fileNameEl) dom.fileNameEl.textContent = file.name;
                dom.uploadBtn.disabled = false;
            }
        };

        dom.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); dom.uploadArea.classList.add('border-green-500'); });
        dom.uploadArea.addEventListener('dragleave', (e) => { e.preventDefault(); dom.uploadArea.classList.remove('border-green-500'); });
        dom.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dom.uploadArea.classList.remove('border-green-500');
            handleFileSelect(e.dataTransfer.files[0]);
        });
        dom.fileInput.addEventListener('change', () => handleFileSelect(dom.fileInput.files[0]));
        dom.uploadBtn.addEventListener('click', handleUpload);
    };

    init();
});
