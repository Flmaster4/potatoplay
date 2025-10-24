document.addEventListener('DOMContentLoaded', () => {
    // --- LIB & CONFIG SETUP ---
    const supabaseUrl = 'https://ogmkthzbvdyrqwmjsxsr.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nbWt0aHpidmR5cnF3bWpzeHNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyMjU0NTMsImV4cCI6MjA3NjgwMTQ1M30.kHXcO7Rewypic2qzWTBy_9LiU33aj2W2C2w_kxXeN14';
    const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    if (window.Telegram?.WebApp) {
        Telegram.WebApp.ready();
    }

    // --- DOM ELEMENTS ---
    const dom = {
        loadingSpinner: document.getElementById('loading'),
        pages: document.querySelectorAll('.page'),
        navBar: document.getElementById('nav-bar'),

        // Player
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
        volumeSlider: document.getElementById('volume-slider'),
        playerFavoriteBtn: document.getElementById('player-favorite-btn'),
        playerOptionsBtn: document.getElementById('player-options-btn'),
        playerOptionsMenu: document.getElementById('player-options-menu'),
        goToAlbumBtn: document.getElementById('goto-album-btn'),
        goToArtistBtn: document.getElementById('goto-artist-btn'),

        // Playlist
        playlistList: document.getElementById('playlist-list'),
        searchPlaylistInput: document.getElementById('search-playlist-input'),
        
        // Favorites
        favoritesList: document.getElementById('favorites-list'),
        searchFavoritesInput: document.getElementById('search-favorites-input'),

        // Top Charts
        chartNav: document.getElementById('chart-nav'),
        topChartsContent: document.getElementById('top-charts-content'),
        topSinglesList: document.getElementById('top-singles-list'),
        topAlbumsList: document.getElementById('top-albums-list'),
        topArtistsList: document.getElementById('top-artists-list'),

        // Profile & Upload
        userName: document.getElementById('user-name'),
        userUsername: document.getElementById('user-username'),
        showUploadSinglePageBtn: document.getElementById('show-upload-single-page'),
        showUploadAlbumPageBtn: document.getElementById('show-upload-album-page'),
        uploadAlbumForm: document.getElementById('upload-album-form'),
        uploadAlbumTitle: document.getElementById('upload-album-title'),
        uploadAlbumArtist: document.getElementById('upload-album-artist'),
        albumArtFileInput: document.getElementById('album-art-file-input'),
        albumArtFileName: document.getElementById('album-art-file-name'),
        albumTracksFileInput: document.getElementById('album-tracks-file-input'),
        albumTracksFileName: document.getElementById('album-tracks-file-name'),
        uploadAlbumBtn: document.getElementById('upload-album-btn'),
        uploadAlbumProgress: document.getElementById('upload-album-progress'),
    };

    // --- AUDIO & STATE ---
    const audio = new Audio();
    const state = {
        playlist: [],
        originalPlaylist: [],
        favorites: [],
        topCharts: { singles: [], albums: [], artists: [] },
        currentTrackIndex: -1,
        isPlaying: false,
        isShuffle: false,
        repeatMode: 'none', // 'none', 'all', 'one'
        currentChartType: 'singles', // 'singles', 'albums', 'artists'
        user: window.Telegram?.WebApp?.initDataUnsafe?.user || null,
        selectedAlbumArtFile: null,
        selectedAlbumTrackFiles: [],
    };

    // --- INITIALIZATION ---
    const init = async () => {
        showLoading(true);
        await upsertUser();
        renderUserInfo();
        await Promise.all([fetchPlaylist(), fetchFavorites(), fetchTopCharts()]);
        setupEventListeners();
        if(dom.uploadAlbumProgress) dom.uploadAlbumProgress.style.display = 'none';
        if(dom.volumeSlider) audio.volume = dom.volumeSlider.value;
        showLoading(false);
    };

    // --- USER MANAGEMENT ---
    const upsertUser = async () => {
        if (!state.user) { console.warn("Данные пользователя из Telegram недоступны."); return; }
        const { error } = await supabaseClient.from('users').upsert({ id: state.user.id, first_name: state.user.first_name, last_name: state.user.last_name, username: state.user.username }, { onConflict: 'id' });
        if (error) console.error("Ошибка при добавлении/обновлении пользователя:", error);
    };

    const renderUserInfo = () => {
        if (!state.user || !dom.userName || !dom.userUsername) return;
        dom.userName.textContent = `${state.user.first_name || ''} ${state.user.last_name || ''}`.trim() || 'Аноним';
        dom.userUsername.textContent = state.user.username ? `@${state.user.username}` : '';
    };

    // --- NAVIGATION ---
    const showPage = (pageId) => {
        dom.pages.forEach(page => page.classList.add('hidden'));
        const pageToShow = document.getElementById(pageId);
        if (pageToShow) pageToShow.classList.remove('hidden');
    };

    const handleNavigation = (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.nav-item');
        if (!targetItem) return;
        const pageName = targetItem.dataset.page;
        if (!pageName) return;

        showPage(pageName);

        dom.navBar.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active', 'text-green-500');
            item.classList.add('text-gray-400');
        });
        targetItem.classList.add('active', 'text-green-500');
        targetItem.classList.remove('text-gray-400');

        // Potentially refresh data on navigation
        if (pageName === 'page-playlist') renderPlaylist();
        if (pageName === 'page-favorites') renderFavorites();
        if (pageName === 'page-top') renderCurrentChart();
        if (pageName === 'page-profile') renderUserInfo();
    };

    // --- DATA FETCHING ---
    const fetchPlaylist = async () => {
        const { data, error } = await supabaseClient.from('music').select('*').order('created_at', { ascending: false });
        if (error) { console.error('Ошибка загрузки плейлиста:', error); return; }
        state.originalPlaylist = data;
        state.playlist = [...state.originalPlaylist];
        if (state.playlist.length > 0 && state.currentTrackIndex === -1) {
            loadTrack(0, false);
        }
    };

    const fetchFavorites = async () => {
        if (!state.user) return;
        const { data, error } = await supabaseClient.from('favorites').select('track_id').eq('user_id', state.user.id);
        if (error) { console.error('Ошибка загрузки избранного:', error); state.favorites = []; return; }
        state.favorites = data.map(fav => fav.track_id);
    };

    const fetchTopCharts = async () => {
        const { data: singles, error: singlesError } = await supabaseClient.from('music').select('*').order('play_count', { ascending: false });
        if (singlesError) { console.error('Ошибка загрузки топ-чартов:', singlesError); return; }
        state.topCharts.singles = singles;

        const { data: albums, error: albumsError } = await supabaseClient.rpc('get_top_albums');
        if (albumsError) { console.error('Ошибка загрузки топ-альбомов:', albumsError); return; }
        state.topCharts.albums = albums;

        const { data: artists, error: artistsError } = await supabaseClient.rpc('get_top_artists');
        if (artistsError) { console.error('Ошибка загрузки топ-исполнителей:', artistsError); return; }
        state.topCharts.artists = artists;
    };

    // --- RENDERING ---
    const renderTrackList = (container, tracks, filter = '', notFoundMessage, options = {}) => {
        if (!container) return;
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
            const trackIndexInMasterPlaylist = state.playlist.findIndex(p => p.id === track.id);
            const isFavorite = state.favorites.includes(track.id);
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            if (trackIndexInMasterPlaylist === state.currentTrackIndex) item.classList.add('bg-gray-800');

            item.innerHTML = `
                <div class="flex items-center space-x-4 overflow-hidden">
                    <img src="${track.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-md flex-shrink-0"/>
                    <div class="truncate">
                        <div class="font-semibold truncate ${trackIndexInMasterPlaylist === state.currentTrackIndex && state.isPlaying ? 'text-green-400' : ''}">${track.title || 'Без названия'}</div>
                        <div class="text-sm text-gray-400 truncate">${track.artist || 'Неизвестен'}</div>
                    </div>
                </div>
                <div class="flex items-center flex-shrink-0">
                    <span class="text-xs text-gray-500 mr-3 w-8 text-right"><i class="fas fa-play mr-1"></i>${track.play_count || 0}</span>
                    <button class="favorite-btn text-gray-500 hover:text-red-500 transition p-2" data-track-id="${track.id}">
                        <i class="${isFavorite ? 'fas text-red-500' : 'far'} fa-heart"></i>
                    </button>
                </div>
            `;
            
            item.addEventListener('click', (e) => {
                 if (e.target.closest('.favorite-btn')) return;
                 if (trackIndexInMasterPlaylist !== -1) {
                    loadTrack(trackIndexInMasterPlaylist, true);
                 }
                 document.querySelector('.nav-item[data-page="page-player"]').click();
            });

            item.querySelector('.favorite-btn')?.addEventListener('click', () => toggleFavorite(track.id));
            container.appendChild(item);
        });
    };

    const renderPlaylist = (filter = '') => {
        const notFound = `<div class="text-center p-4 text-gray-500">Треки не найдены.</div>`;
        renderTrackList(dom.playlistList, state.playlist, filter, notFound);
    };

    const renderFavorites = (filter = '') => {
        const favoriteTracks = state.originalPlaylist.filter(track => state.favorites.includes(track.id));
        const notFound = `<div class="flex flex-col items-center text-center text-gray-500 mt-16"><i class="fas fa-heart-broken text-6xl mb-4"></i><p class="text-lg">Избранных треков не найдено.</p></div>`;
        renderTrackList(dom.favoritesList, favoriteTracks, filter, notFound);
    };

    const renderCurrentChart = () => {
        const filter = ''; // Add search later if needed
        dom.topSinglesList.classList.toggle('hidden', state.currentChartType !== 'singles');
        dom.topAlbumsList.classList.toggle('hidden', state.currentChartType !== 'albums');
        dom.topArtistsList.classList.toggle('hidden', state.currentChartType !== 'artists');

        switch(state.currentChartType) {
            case 'singles': renderTopSingles(filter); break;
            case 'albums': renderTopAlbums(filter); break;
            case 'artists': renderTopArtists(filter); break;
        }
    };
    
    const renderTopSingles = (filter = '') => {
        const notFound = `<div class="text-center p-4 text-gray-500">Нет популярных треков.</div>`;
        renderTrackList(dom.topSinglesList, state.topCharts.singles, filter, notFound);
    };

    const renderTopAlbums = (filter = '') => {
        if (!dom.topAlbumsList) return;
        dom.topAlbumsList.innerHTML = '';
        const filteredAlbums = state.topCharts.albums.filter(album => 
            (album.album_title || '').toLowerCase().includes(filter) ||
            (album.artist || '').toLowerCase().includes(filter)
        );

        if (filteredAlbums.length === 0) {
            dom.topAlbumsList.innerHTML = `<div class="text-center p-4 text-gray-500">Нет популярных альбомов.</div>`;
            return;
        }

        filteredAlbums.forEach(album => {
            const item = document.createElement('div');
            item.className = 'flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            item.innerHTML = `
                <img src="${album.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-md flex-shrink-0"/>
                <div class="truncate">
                    <div class="font-semibold truncate">${album.album_title || 'Без названия'}</div>
                    <div class="text-sm text-gray-400 truncate">${album.artist || 'Неизвестен'}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                alert(`Переход к альбому: ${album.album_title}`);
            });
            dom.topAlbumsList.appendChild(item);
        });
    };

    const renderTopArtists = (filter = '') => {
        if (!dom.topArtistsList) return;
        dom.topArtistsList.innerHTML = '';
        const filteredArtists = state.topCharts.artists.filter(artist => 
            (artist.artist || '').toLowerCase().includes(filter)
        );

        if (filteredArtists.length === 0) {
            dom.topArtistsList.innerHTML = `<div class="text-center p-4 text-gray-500">Нет популярных исполнителей.</div>`;
            return;
        }

        filteredArtists.forEach(artist => {
            const item = document.createElement('div');
            item.className = 'flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-800 cursor-pointer';
            item.innerHTML = `
                <img src="${artist.album_art_url || 'https://via.placeholder.com/40'}" class="w-10 h-10 rounded-full flex-shrink-0"/>
                <div class="truncate">
                    <div class="font-semibold truncate">${artist.artist || 'Неизвестен'}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                alert(`Переход к исполнителю: ${artist.artist}`);
            });
            dom.topArtistsList.appendChild(item);
        });
    };

    const updateAllRenderings = () => {
        renderPlaylist(dom.searchPlaylistInput.value.toLowerCase());
        renderFavorites(dom.searchFavoritesInput.value.toLowerCase());
        renderCurrentChart();
        updatePlayerFavoriteButton();
    }

    // --- FAVORITES LOGIC ---
    const toggleFavorite = async (trackId) => {
        if (!state.user || !trackId) { alert('Не удалось определить пользователя или трек.'); return; }
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
        updateAllRenderings();
    };
    
    const updatePlayerFavoriteButton = () => {
        if (!dom.playerFavoriteBtn) return;
        const currentTrack = state.playlist[state.currentTrackIndex];
        if (!currentTrack) return;
        const isFavorite = state.favorites.includes(currentTrack.id);
        dom.playerFavoriteBtn.innerHTML = `<i class="${isFavorite ? 'fas text-red-500' : 'far'} fa-heart"></i>`;
    };

    // --- PLAYER LOGIC ---
    const loadTrack = async (index, andPlay = true) => {
        if (index === state.currentTrackIndex && audio.src) { if(andPlay) playTrack(); return; }
        if (index < 0 || index >= state.playlist.length) return;
        
        state.currentTrackIndex = index;
        const track = state.playlist[index];

        // Increment play count (RPC call)
        supabaseClient.rpc('increment_play_count', { track_id_to_inc: track.id }).then(({error}) => {
            if (error) console.error('Ошибка увеличения счетчика прослушиваний:', error);
            else {
                 const trackInOriginal = state.originalPlaylist.find(t => t.id === track.id);
                if(trackInOriginal) trackInOriginal.play_count = (trackInOriginal.play_count || 0) + 1;
            }
        });

        dom.trackTitle.textContent = track.title || 'Без названия';
        dom.trackArtist.textContent = track.artist || 'Неизвестен';
        audio.src = track.url;
        dom.albumArt.src = track.album_art_url || 'https://via.placeholder.com/300';
        
        updateAllRenderings();

        if (andPlay) playTrack();
    };

    const playTrack = () => {
        if (!audio.src) return;
        audio.play().then(() => {
            state.isPlaying = true;
            dom.playBtnIcon.classList.replace('fa-play-circle', 'fa-pause-circle');
            updateAllRenderings();
        }).catch(e => console.error("Ошибка воспроизведения:", e));
    };

    const pauseTrack = () => {
        state.isPlaying = false;
        audio.pause();
        dom.playBtnIcon.classList.replace('fa-pause-circle', 'fa-play-circle');
        updateAllRenderings();
    };

    const prevTrack = () => {
        const newIndex = state.isShuffle 
            ? Math.floor(Math.random() * state.playlist.length)
            : (state.currentTrackIndex - 1 + state.playlist.length) % state.playlist.length;
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

    // --- UI & UX HELPERS ---
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

    const showLoading = (show) => {
        if(dom.loadingSpinner) dom.loadingSpinner.classList.toggle('hidden', !show);
    }

    // --- UPLOAD LOGIC (NEW) ---
    const handleAlbumUpload = async () => {
        // Placeholder logic
        alert('Функция загрузки альбома в разработке!');
        console.log('Название альбома:', dom.uploadAlbumTitle.value);
        console.log('Исполнитель альбома:', dom.uploadAlbumArtist.value);
        console.log('Файл обложки альбома:', state.selectedAlbumArtFile);
        console.log('Файлы треков:', state.selectedAlbumTrackFiles);
    };
    
    // --- OPTIONS LOGIC ---
    const goToAlbum = () => {
        alert('Функция перехода к альбому в разработке!');
    };
    const goToArtist = () => {
        alert('Функция перехода к артисту в разработке!');
    };


    // --- EVENT LISTENERS ---
    const setupEventListeners = () => {
        // Player
        dom.playBtn?.addEventListener('click', () => state.isPlaying ? pauseTrack() : playTrack());
        dom.prevBtn?.addEventListener('click', prevTrack);
        dom.nextBtn?.addEventListener('click', () => nextTrack(true));
        audio.addEventListener('timeupdate', updateProgress);
        audio.addEventListener('loadedmetadata', updateProgress);
        audio.addEventListener('ended', () => nextTrack(false));
        dom.progressContainer?.addEventListener('click', setProgress);
        dom.volumeSlider?.addEventListener('input', (e) => audio.volume = e.target.value);

        // Player buttons
        dom.playerFavoriteBtn?.addEventListener('click', () => {
            const currentTrack = state.playlist[state.currentTrackIndex];
            if (currentTrack) toggleFavorite(currentTrack.id);
        });
        dom.playerOptionsBtn?.addEventListener('click', () => {
            dom.playerOptionsMenu?.classList.toggle('hidden');
        });
        dom.goToAlbumBtn?.addEventListener('click', goToAlbum);
        dom.goToArtistBtn?.addEventListener('click', goToArtist);

        // Navigation
        dom.navBar?.addEventListener('click', handleNavigation);
        dom.showUploadSinglePageBtn?.addEventListener('click', () => showPage('page-upload-single'));
        dom.showUploadAlbumPageBtn?.addEventListener('click', () => showPage('page-upload-album'));

        // Chart Navigation
        dom.chartNav?.addEventListener('click', (e) => {
            e.preventDefault();
            const targetItem = e.target.closest('.chart-nav-item');
            if (!targetItem) return;
            state.currentChartType = targetItem.dataset.chartType;
            dom.chartNav.querySelectorAll('.chart-nav-item').forEach(item => {
                item.classList.remove('active', 'text-green-500');
                item.classList.add('text-gray-400');
            });
            targetItem.classList.add('active', 'text-green-500');
            targetItem.classList.remove('text-gray-400');
            renderCurrentChart();
        });

        // Search
        dom.searchPlaylistInput?.addEventListener('input', (e) => renderPlaylist(e.target.value.toLowerCase()));
        dom.searchFavoritesInput?.addEventListener('input', (e) => renderFavorites(e.target.value.toLowerCase()));

        // Player Controls
        dom.shuffleBtn?.addEventListener('click', () => {
            state.isShuffle = !state.isShuffle;
            dom.shuffleBtn.classList.toggle('text-green-500', state.isShuffle);
            dom.shuffleBtn.classList.toggle('text-gray-400', !state.isShuffle);
            // Logic to shuffle playlist will be here
        });
        dom.repeatBtn?.addEventListener('click', () => {
            const modes = ['none', 'all', 'one'];
            state.repeatMode = modes[(modes.indexOf(state.repeatMode) + 1) % modes.length];
            const icon = dom.repeatBtn.querySelector('i');
            icon.className = state.repeatMode === 'one' ? 'fas fa-retweet' : 'fas fa-redo';
            dom.repeatBtn.classList.toggle('text-green-500', state.repeatMode !== 'none');
            dom.repeatBtn.classList.toggle('text-gray-400', state.repeatMode === 'none');
        });

        // Album Upload
        dom.albumArtFileInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) {
                state.selectedAlbumArtFile = file;
                dom.albumArtFileName.textContent = file.name;
            }
        });
        dom.albumTracksFileInput?.addEventListener('change', (e) => {
            state.selectedAlbumTrackFiles = Array.from(e.target.files);
            dom.albumTracksFileName.textContent = `${state.selectedAlbumTrackFiles.length} треков выбрано`;
        });
        dom.uploadAlbumBtn?.addEventListener('click', handleAlbumUpload);
    };

    init();
});
