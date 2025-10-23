document.addEventListener('DOMContentLoaded', () => {
    // --- LIB & CONFIG SETUP ---
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
        searchTopInput: document.getElementById('search-top-input'),
        topChartsList: document.getElementById('top-charts-list'),
        uploadBtn: document.getElementById('upload-btn'),
        uploadProgress: document.getElementById('upload-progress'),
        navBar: document.getElementById('nav-bar'),
        pages: document.querySelectorAll('.page'),
        uploadForm: document.getElementById('upload-form'),
        uploadArea: document.getElementById('upload-area'),
        audioFileInput: document.getElementById('audio-file-input'),
        audioFileName: document.getElementById('audio-file-name'),
        uploadTitle: document.getElementById('upload-title'),
        uploadArtist: document.getElementById('upload-artist'),
        uploadArtArea: document.getElementById('upload-art-area'),
        artFileInput: document.getElementById('art-file-input'),
        artFileName: document.getElementById('art-file-name'),
    };

    // --- AUDIO & STATE ---
    const audio = new Audio();
    const state = {
        playlist: [],
        originalPlaylist: [],
        favorites: [],
        topCharts: [],
        currentTrackIndex: -1,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none',
        user: Telegram.WebApp.initDataUnsafe?.user || null,
        selectedAudioFile: null,
        selectedArtFile: null,
    };

    // --- INITIALIZATION ---
    const init = async () => {
        showLoading(true);
        await upsertUser();
        await Promise.all([fetchPlaylist(), fetchFavorites()]);
        setupEventListeners();
        validateUploadForm();
        dom.uploadProgress.style.display = 'none';
        audio.volume = dom.volumeSlider.value;
        showLoading(false);
    };

    // --- USER MANAGEMENT ---
    const upsertUser = async () => {
        if (!state.user) { console.warn("User data not available from Telegram."); return; }
        const { error } = await supabaseClient.from('users').upsert({ id: state.user.id, first_name: state.user.first_name, last_name: state.user.last_name, username: state.user.username }, { onConflict: 'id' });
        if (error) console.error("Error upserting user:", error);
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

        if (pageName === 'page-favorites') renderFavorites();
        if (pageName === 'page-top') renderTopCharts();
    };

    // --- DATA FETCHING ---
    const fetchPlaylist = async () => {
        const { data, error } = await supabaseClient.from('music').select('*').order('created_at', { ascending: false });
        if (error) { console.error('Ошибка загрузки плейлиста:', error); return; }
        state.originalPlaylist = data;
        state.playlist = [...state.originalPlaylist];
        renderPlaylist();
        if (state.playlist.length > 0 && state.currentTrackIndex === -1) loadTrack(0, false);
    };

    const fetchFavorites = async () => {
        if (!state.user) return;
        const { data, error } = await supabaseClient.from('favorites').select('track_id').eq('user_id', state.user.id);
        if (error) { console.error('Ошибка загрузки избранного:', error); state.favorites = []; return; }
        state.favorites = data.map(fav => fav.track_id);
    };

    // --- RENDERING ---
    const renderTrackList = (container, tracks, filter = '', notFoundMessage, playAction) => {
        container.innerHTML = '';
        const filteredTracks = tracks.filter(track => 
            (track.title || '').toLowerCase().includes(filter) || 
            (track.artist || '').toLowerCase().includes(filter)
        );

        if (filteredTracks.length === 0) {
            container.innerHTML = notFoundMessage;
            return;
        }

        filteredTracks.forEach(track => {
            const trackIndex = state.playlist.findIndex(p => p.id === track.id);
            const isFavorite = state.favorites.includes(track.id);
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            if (trackIndex === state.currentTrackIndex) item.classList.add('bg-gray-800');

            item.innerHTML = `
                <div class="flex items-center space-x-4 overflow-hidden">
                    <img src="${track.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-md flex-shrink-0"/>
                    <div class="truncate">
                        <div class="font-semibold truncate ${trackIndex === state.currentTrackIndex && state.isPlaying ? 'text-green-400' : ''}">${track.title || 'Без названия'}</div>
                        <div class="text-sm text-gray-400 truncate">${track.artist || 'Неизвестен'}</div>
                    </div>
                </div>
                <div class="flex items-center flex-shrink-0">
                    <span class="text-xs text-gray-500 mr-3 w-8 text-right"><i class="fas fa-play mr-1"></i>${track.play_count || 0}</span>
                    <button class="favorite-btn text-gray-500 hover:text-red-500 transition p-2" data-track-id="${track.id}">
                        <i class="${isFavorite ? 'fas text-red-500' : 'far'} fa-heart"></i>
                    </button>
                    ${container === dom.playlistContainer ? '<button class="delete-btn text-gray-500 hover:text-red-500 transition p-2"><i class="fas fa-trash-alt"></i></button>' : ''}
                </div>
            `;

            item.addEventListener('click', (e) => playAction(e, track));
            item.querySelector('.favorite-btn')?.addEventListener('click', () => toggleFavorite(track.id));
            item.querySelector('.delete-btn')?.addEventListener('click', () => deleteTrack(track));

            container.appendChild(item);
        });
    };

    const renderPlaylist = () => {
        const notFound = `<div class="text-center p-4 text-gray-500">Треки не найдены.</div>`;
        renderTrackList(dom.playlistContainer, state.playlist, '', notFound, (e, track) => {
            if (e.target.closest('.delete-btn') || e.target.closest('.favorite-btn')) return;
            const trackIndex = state.playlist.findIndex(p => p.id === track.id);
            loadTrack(trackIndex, true);
        });
    };

    const renderFavorites = (filter = '') => {
        const favoriteTracks = state.originalPlaylist.filter(track => state.favorites.includes(track.id));
        const notFound = `<div class="flex flex-col items-center text-center text-gray-500 mt-16"><i class="fas fa-heart-broken text-6xl mb-4"></i><p class="text-lg">Избранных треков не найдено.</p></div>`;
        renderTrackList(dom.favoritesList, favoriteTracks, filter, notFound, (e, track) => {
            if (e.target.closest('.favorite-btn')) { 
                toggleFavorite(track.id).then(() => renderFavorites(dom.searchFavoritesInput.value.toLowerCase()));
                return; 
            }
            const trackIndex = state.playlist.findIndex(p => p.id === track.id);
            if (trackIndex !== -1) loadTrack(trackIndex, true);
            document.querySelector('.nav-item[data-page="page-player"]').click();
        });
    };

    const renderTopCharts = async (filter = '') => {
        const { data, error } = await supabaseClient.from('music').select('*').order('play_count', { ascending: false });
        if (error) { console.error('Error fetching top charts:', error); return; }
        state.topCharts = data;
        const notFound = `<div class="flex flex-col items-center text-center text-gray-500 mt-16"><i class="fas fa-trophy text-6xl mb-4"></i><p class="text-lg">Пока никто не слушал музыку.</p></div>`;
        renderTrackList(dom.topChartsList, state.topCharts, filter, notFound, (e, track) => {
             if (e.target.closest('.favorite-btn')) { 
                toggleFavorite(track.id).then(() => renderTopCharts(dom.searchTopInput.value.toLowerCase()));
                return; 
            }
            const trackIndex = state.playlist.findIndex(p => p.id === track.id);
            if (trackIndex !== -1) loadTrack(trackIndex, true);
            document.querySelector('.nav-item[data-page="page-player"]').click();
        });
    };

    // --- FAVORITES LOGIC ---
    const toggleFavorite = async (trackId) => {
        if (!state.user) { alert('Не удалось определить пользователя.'); return; }
        const isFavorite = state.favorites.includes(trackId);

        if (isFavorite) {
            const { error } = await supabaseClient.from('favorites').delete().match({ user_id: state.user.id, track_id: trackId });
            if (error) console.error('Ошибка удаления из избранного:', error);
            else state.favorites = state.favorites.filter(id => id !== trackId);
        } else {
            const { error } = await supabaseClient.from('favorites').insert([{ user_id: state.user.id, track_id: trackId }]);
            if (error) console.error('Ошибка добавления в избранное:', error);
            else state.favorites.push(trackId);
        }
        renderPlaylist();
        if (!document.getElementById('page-favorites').classList.contains('hidden')) renderFavorites(dom.searchFavoritesInput.value.toLowerCase());
        if (!document.getElementById('page-top').classList.contains('hidden')) renderTopCharts(dom.searchTopInput.value.toLowerCase());
    };

    // --- TRACK MANAGEMENT ---
    const loadTrack = async (index, andPlay = true) => {
        if (index === state.currentTrackIndex && audio.src) { if(andPlay) playTrack(); return; }
        if (index < 0 || index >= state.playlist.length) return;
        
        state.currentTrackIndex = index;
        const track = state.playlist[index];

        const { error } = await supabaseClient.rpc('increment_play_count', { track_id_to_inc: track.id });
        if (error) console.error('Error incrementing play count:', error);
        else track.play_count = (track.play_count || 0) + 1;

        dom.trackTitle.textContent = track.title || 'Без названия';
        dom.trackArtist.textContent = track.artist || 'Неизвестен';
        audio.src = track.url;
        dom.albumArt.src = track.album_art_url || 'https://via.placeholder.com/300';
        renderPlaylist();
        if (andPlay) playTrack();
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
        const newIndex = state.isShuffle ? Math.floor(Math.random() * state.playlist.length) : (state.currentTrackIndex - 1 + state.playlist.length) % state.playlist.length;
        loadTrack(newIndex, true);
    };

    const nextTrack = (force = false) => {
        if (state.repeatMode === 'one' && !force) { audio.currentTime = 0; playTrack(); return; }
        let newIndex = state.isShuffle ? Math.floor(Math.random() * state.playlist.length) : state.currentTrackIndex + 1;
        if (newIndex >= state.playlist.length) {
            if (state.repeatMode === 'all') newIndex = 0;
            else { pauseTrack(); if(state.playlist.length > 0) loadTrack(0, false); return; }
        }
        loadTrack(newIndex, true);
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

    // --- UPLOAD LOGIC ---
    const sanitizeFileName = (fileName) => {
        const cyrillicToLatinMap = {
            'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i',
            'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
            'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y',
            'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
        };
        return fileName.toLowerCase()
            .split('').map(char => cyrillicToLatinMap[char] || char).join('') // Transliterate
            .replace(/\s+/g, '_') // Replace spaces with _
            .replace(/[^a-z0-9_.-]/g, '') // Remove all non-alphanumeric chars except _, ., -
            .replace(/__+/g, '_'); // Replace multiple __ with single _
    };

    const validateUploadForm = () => {
        dom.uploadBtn.disabled = !(state.selectedAudioFile && dom.uploadTitle.value.trim() !== '');
    };

    const resetUploadForm = () => {
        dom.uploadForm.reset();
        state.selectedAudioFile = null;
        state.selectedArtFile = null;
        dom.audioFileName.textContent = '';
        dom.artFileName.textContent = '';
        dom.uploadProgress.style.display = 'none';
        dom.uploadProgress.value = 0;
        validateUploadForm();
    };

    const handleUpload = async () => {
        if (!state.selectedAudioFile || !dom.uploadTitle.value.trim()) return;
        showLoading(true);
        dom.uploadBtn.disabled = true;
        dom.uploadProgress.style.display = 'block';
        dom.uploadProgress.value = 0;

        // 1. Sanitize and upload audio file
        const sanitizedAudioName = sanitizeFileName(state.selectedAudioFile.name);
        const audioFilePath = `${Date.now()}_${sanitizedAudioName}`;
        const { error: audioError } = await supabaseClient.storage.from('music').upload(audioFilePath, state.selectedAudioFile, { 
            contentType: state.selectedAudioFile.type || 'audio/mpeg', upsert: false 
        });

        if (audioError) {
            alert(`Ошибка загрузки аудио: ${audioError.message}`);
            console.error("Audio upload error:", audioError);
            showLoading(false);
            validateUploadForm();
            return;
        }
        const { data: { publicUrl: audioPublicUrl } } = supabaseClient.storage.from('music').getPublicUrl(audioFilePath);
        dom.uploadProgress.value = 50;

        // 2. Sanitize and upload album art (if selected)
        let artPublicUrl = null;
        if (state.selectedArtFile) {
            const sanitizedArtName = sanitizeFileName(state.selectedArtFile.name);
            const artFilePath = `art_${Date.now()}_${sanitizedArtName}`;
            const { error: artError } = await supabaseClient.storage.from('music').upload(artFilePath, state.selectedArtFile, { 
                contentType: state.selectedArtFile.type || 'image/jpeg', upsert: false 
            });

            if (artError) {
                // Non-critical error, we can proceed without album art
                console.warn('Не удалось загрузить обложку (продолжаем):', artError.message);
            } else {
                const { data: { publicUrl } } = supabaseClient.storage.from('music').getPublicUrl(artFilePath);
                artPublicUrl = publicUrl;
            }
        }
        dom.uploadProgress.value = 100;

        // 3. Insert into database
        const { error: dbError } = await supabaseClient.from('music').insert([{
            title: dom.uploadTitle.value.trim(),
            artist: dom.uploadArtist.value.trim() || 'Неизвестен',
            url: audioPublicUrl,
            album_art_url: artPublicUrl,
            play_count: 0
        }]).select();

        if (dbError) {
            alert(`Ошибка сохранения в базу: ${dbError.message}`);
            console.error("DB insert error:", dbError);
        } else {
            await fetchPlaylist();
            alert('Трек успешно загружен!');
            resetUploadForm();
            document.querySelector('.nav-item[data-page="page-player"]').click();
        }
        showLoading(false);
    };

    const deleteTrack = async (track) => {
        if (!confirm(`Удалить трек "${track.title}"?`)) return;
        showLoading(true);
        const filesToDelete = [];
        if (track.url) filesToDelete.push(track.url.split('/').pop());
        if (track.album_art_url) filesToDelete.push(track.album_art_url.split('/').pop());
        if(filesToDelete.length > 0) await supabaseClient.storage.from('music').remove(filesToDelete);
        await supabaseClient.from('music').delete().match({ id: track.id });
        if (audio.src === track.url) { pauseTrack(); audio.src = ''; }
        await Promise.all([fetchPlaylist(), fetchFavorites()]);
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
        dom.searchTopInput.addEventListener('input', (e) => renderTopCharts(e.target.value.toLowerCase()));
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
            icon.className = state.repeatMode === 'one' ? 'fas fa-retweet' : 'fas fa-redo';
            dom.repeatBtn.classList.toggle('text-green-500', state.repeatMode !== 'none');
            dom.repeatBtn.classList.toggle('text-gray-400', state.repeatMode === 'none');
        });

        // Upload form listeners
        dom.uploadTitle.addEventListener('input', validateUploadForm);
        const createDragHandler = (area, fileNameEl, fileStateKey) => {
            area.addEventListener('dragover', (e) => { e.preventDefault(); area.classList.add('border-green-500'); });
            area.addEventListener('dragleave', (e) => { e.preventDefault(); area.classList.remove('border-green-500'); });
            area.addEventListener('drop', (e) => {
                 e.preventDefault();
                 area.classList.remove('border-green-500');
                 const file = e.dataTransfer.files[0];
                 if(file) { fileNameEl.textContent = file.name; state[fileStateKey] = file; validateUploadForm(); }
            });
        };
        createDragHandler(dom.uploadArea, dom.audioFileName, 'selectedAudioFile');
        createDragHandler(dom.uploadArtArea, dom.artFileName, 'selectedArtFile');

        dom.audioFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) { state.selectedAudioFile = file; dom.audioFileName.textContent = file.name; validateUploadForm(); }
        });
        dom.artFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) { state.selectedArtFile = file; dom.artFileName.textContent = file.name; validateUploadForm(); }
        });

        dom.uploadBtn.addEventListener('click', handleUpload);
    };

    init();
});
