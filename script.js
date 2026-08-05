'use strict';

const API_BASE = 'https://api.openweathermap.org/data/2.5';
const STORAGE_KEYS = {
    theme: 'skyflow-theme',
    units: 'skyflow-units',
    recent: 'skyflow-recent',
    favorites: 'skyflow-favorites',
    lastLocation: 'skyflow-last-location'
};

const state = {
    units: localStorage.getItem(STORAGE_KEYS.units) || 'metric',
    theme: localStorage.getItem(STORAGE_KEYS.theme) || 'light',
    currentLocation: null,
    recent: readStoredArray(STORAGE_KEYS.recent),
    favorites: readStoredArray(STORAGE_KEYS.favorites),
    retryAction: null,
    clockTimer: null,
    refreshTimer: null,
    requestId: 0
};

const elements = {
    html: document.documentElement,
    body: document.body,
    offlineBanner: document.getElementById('offline-banner'),
    loader: document.getElementById('loader'),
    errorModal: document.getElementById('error-modal'),
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message'),
    retryBtn: document.getElementById('retry-btn'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    geoBtn: document.getElementById('geo-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    unitToggle: document.getElementById('unit-toggle'),
    favoritesList: document.getElementById('favorites-list'),
    recentList: document.getElementById('recent-list'),
    cityName: document.getElementById('city-name'),
    countryBadge: document.getElementById('country-badge'),
    favBtn: document.getElementById('fav-btn'),
    currentDate: document.getElementById('current-date'),
    currentTime: document.getElementById('current-time'),
    weatherIcon: document.getElementById('weather-icon'),
    currentTemp: document.getElementById('current-temp'),
    weatherDesc: document.getElementById('weather-desc'),
    feelsLike: document.getElementById('feels-like'),
    windSpeed: document.getElementById('wind-speed'),
    humidity: document.getElementById('humidity'),
    pressure: document.getElementById('pressure'),
    visibility: document.getElementById('visibility'),
    aqi: document.getElementById('aqi'),
    sunrise: document.getElementById('sunrise'),
    sunset: document.getElementById('sunset'),
    hourlyContainer: document.getElementById('hourly-container'),
    forecastContainer: document.getElementById('forecast-container')
};

function readStoredArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(value) ? value : [];
    } catch {
        return [];
    }
}

function saveState() {
    localStorage.setItem(STORAGE_KEYS.recent, JSON.stringify(state.recent));
    localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(state.favorites));
    localStorage.setItem(STORAGE_KEYS.units, state.units);
    localStorage.setItem(STORAGE_KEYS.theme, state.theme);
    if (state.currentLocation) {
        localStorage.setItem(STORAGE_KEYS.lastLocation, JSON.stringify(state.currentLocation));
    }
}

function getApiKey() {
    if (typeof API_KEY !== 'string' || !API_KEY.trim() || API_KEY.includes('YOUR_')) {
        throw new Error('OpenWeather API key is missing. Add it in config.js.');
    }
    return API_KEY.trim();
}

async function fetchJson(url) {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    let data = null;
    try {
        data = await response.json();
    } catch {
        throw new Error('Weather service returned an unreadable response.');
    }

    if (!response.ok) {
        const message = data?.message || `Request failed (${response.status}).`;
        if (response.status === 401) {
            throw new Error('Invalid or inactive API key. Check config.js and your OpenWeather account.');
        }
        if (response.status === 404) {
            throw new Error('City not found. Check the spelling and try again.');
        }
        if (response.status === 429) {
            throw new Error('API request limit reached. Please wait and try again.');
        }
        throw new Error(capitalize(message));
    }

    return data;
}

function buildUrl(endpoint, params) {
    const url = new URL(`${API_BASE}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });
    url.searchParams.set('appid', getApiKey());
    return url.toString();
}

async function loadWeatherByCity(city, options = {}) {
    const cleanCity = city.trim();
    if (!cleanCity) {
        showError('Enter a city name', 'Type a city such as Bengaluru, Mumbai, Delhi or London.', () => elements.searchInput.focus());
        return;
    }

    const action = () => loadWeatherByCity(cleanCity, options);
    state.retryAction = action;
    await runWeatherRequest(async () => {
        const currentUrl = buildUrl('weather', {
            q: cleanCity,
            units: state.units,
            lang: 'en'
        });
        const current = await fetchJson(currentUrl);
        await loadCompleteWeather(current, { addRecent: options.addRecent !== false });
    }, action);
}

async function loadWeatherByCoordinates(lat, lon, options = {}) {
    const action = () => loadWeatherByCoordinates(lat, lon, options);
    state.retryAction = action;
    await runWeatherRequest(async () => {
        const currentUrl = buildUrl('weather', {
            lat,
            lon,
            units: state.units,
            lang: 'en'
        });
        const current = await fetchJson(currentUrl);
        await loadCompleteWeather(current, { addRecent: options.addRecent !== false });
    }, action);
}

async function runWeatherRequest(task, retryAction) {
    if (!navigator.onLine) {
        showError('You are offline', 'Reconnect to the internet and try again.', retryAction);
        return;
    }

    const requestId = ++state.requestId;
    setLoading(true);
    hideError();

    try {
        await task();
    } catch (error) {
        if (requestId === state.requestId) {
            showError('Weather unavailable', error instanceof Error ? error.message : 'Something went wrong.', retryAction);
        }
    } finally {
        if (requestId === state.requestId) {
            setLoading(false);
        }
    }
}

async function loadCompleteWeather(current, options = {}) {
    const { lat, lon } = current.coord;
    const forecastUrl = buildUrl('forecast', {
        lat,
        lon,
        units: state.units,
        lang: 'en'
    });
    const airUrl = buildUrl('air_pollution', { lat, lon });

    const [forecastResult, airResult] = await Promise.allSettled([
        fetchJson(forecastUrl),
        fetchJson(airUrl)
    ]);

    if (forecastResult.status !== 'fulfilled') {
        throw forecastResult.reason;
    }

    const location = {
        name: current.name || 'Unknown location',
        country: current.sys?.country || '',
        lat,
        lon,
        timezone: Number(current.timezone) || 0
    };

    state.currentLocation = location;
    if (options.addRecent !== false) addRecentLocation(location);
    saveState();

    renderCurrentWeather(current);
    renderHourlyForecast(forecastResult.value, location.timezone);
    renderFiveDayForecast(forecastResult.value, location.timezone);
    renderAirQuality(airResult.status === 'fulfilled' ? airResult.value : null);
    renderLocationLists();
    updateFavoriteButton();
    startLocationClock(location.timezone);
    scheduleAutoRefresh();
}

function renderCurrentWeather(data) {
    const weather = data.weather?.[0] || {};
    const location = state.currentLocation;
    const temperatureUnit = state.units === 'metric' ? '°C' : '°F';
    const windValue = state.units === 'metric'
        ? `${Math.round((data.wind?.speed || 0) * 3.6)} km/h`
        : `${Math.round(data.wind?.speed || 0)} mph`;

    elements.cityName.textContent = location.name;
    elements.countryBadge.textContent = location.country || '--';
    elements.currentTemp.textContent = `${Math.round(data.main?.temp ?? 0)}${temperatureUnit}`;
    elements.feelsLike.textContent = `${Math.round(data.main?.feels_like ?? 0)}${temperatureUnit}`;
    elements.weatherDesc.textContent = capitalize(weather.description || weather.main || 'Unknown');
    elements.windSpeed.textContent = windValue;
    elements.humidity.textContent = `${data.main?.humidity ?? '--'}%`;
    elements.pressure.textContent = `${data.main?.pressure ?? '--'} hPa`;
    elements.visibility.textContent = `${((data.visibility || 0) / 1000).toFixed(1)} km`;
    elements.sunrise.textContent = formatUnixTime(data.sys?.sunrise, location.timezone);
    elements.sunset.textContent = formatUnixTime(data.sys?.sunset, location.timezone);

    if (weather.icon) {
        elements.weatherIcon.src = `https://openweathermap.org/img/wn/${weather.icon}@4x.png`;
        elements.weatherIcon.alt = weather.description || 'Weather icon';
        elements.weatherIcon.classList.remove('hidden');
    } else {
        elements.weatherIcon.classList.add('hidden');
    }

    setDynamicBackground(weather.main || '', weather.icon || '');
}

function renderAirQuality(data) {
    const aqiValue = data?.list?.[0]?.main?.aqi;
    const labels = {
        1: 'Good',
        2: 'Fair',
        3: 'Moderate',
        4: 'Poor',
        5: 'Very Poor'
    };
    elements.aqi.textContent = labels[aqiValue] || 'Unavailable';
}

function renderHourlyForecast(data, timezone) {
    elements.hourlyContainer.replaceChildren();
    const items = Array.isArray(data.list) ? data.list.slice(0, 8) : [];

    items.forEach((item, index) => {
        const weather = item.weather?.[0] || {};
        const card = document.createElement('article');
        card.className = 'hourly-item';

        const time = document.createElement('span');
        time.textContent = index === 0 ? 'Next' : formatUnixTime(item.dt, timezone);

        const icon = document.createElement('img');
        icon.src = `https://openweathermap.org/img/wn/${weather.icon || '01d'}@2x.png`;
        icon.alt = weather.description || 'Forecast';
        icon.loading = 'lazy';

        const temperature = document.createElement('strong');
        temperature.textContent = `${Math.round(item.main?.temp ?? 0)}°`;

        card.append(time, icon, temperature);
        elements.hourlyContainer.appendChild(card);
    });
}

function renderFiveDayForecast(data, timezone) {
    elements.forecastContainer.replaceChildren();
    const grouped = groupForecastByLocalDay(data.list || [], timezone);
    const days = [...grouped.values()].slice(0, 5);

    days.forEach((day) => {
        const representative = chooseRepresentativeForecast(day.items, timezone);
        const weather = representative.weather?.[0] || {};
        const minTemp = Math.min(...day.items.map(item => Number(item.main?.temp_min ?? item.main?.temp ?? 0)));
        const maxTemp = Math.max(...day.items.map(item => Number(item.main?.temp_max ?? item.main?.temp ?? 0)));

        const row = document.createElement('article');
        row.className = 'forecast-item';

        const dayName = document.createElement('span');
        dayName.className = 'day';
        dayName.textContent = formatUnixDate(representative.dt, timezone, { weekday: 'long' });

        const center = document.createElement('div');
        center.className = 'forecast-center';
        const icon = document.createElement('img');
        icon.src = `https://openweathermap.org/img/wn/${weather.icon || '01d'}@2x.png`;
        icon.alt = weather.description || 'Forecast';
        icon.loading = 'lazy';
        const description = document.createElement('span');
        description.textContent = capitalize(weather.description || weather.main || '--');
        center.append(icon, description);

        const temperatures = document.createElement('div');
        temperatures.className = 'temps';
        temperatures.innerHTML = `${Math.round(maxTemp)}° <span>${Math.round(minTemp)}°</span>`;

        row.append(dayName, center, temperatures);
        elements.forecastContainer.appendChild(row);
    });
}

function groupForecastByLocalDay(items, timezone) {
    const grouped = new Map();
    items.forEach(item => {
        const date = shiftedDate(item.dt, timezone);
        const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}`;
        if (!grouped.has(key)) grouped.set(key, { items: [] });
        grouped.get(key).items.push(item);
    });
    return grouped;
}

function chooseRepresentativeForecast(items, timezone) {
    return items.reduce((best, item) => {
        const itemHour = shiftedDate(item.dt, timezone).getUTCHours();
        const bestHour = shiftedDate(best.dt, timezone).getUTCHours();
        return Math.abs(itemHour - 12) < Math.abs(bestHour - 12) ? item : best;
    }, items[0]);
}

function addRecentLocation(location) {
    state.recent = [location, ...state.recent.filter(item => !sameLocation(item, location))].slice(0, 6);
}

function toggleFavorite() {
    if (!state.currentLocation) return;
    const exists = state.favorites.some(item => sameLocation(item, state.currentLocation));
    state.favorites = exists
        ? state.favorites.filter(item => !sameLocation(item, state.currentLocation))
        : [state.currentLocation, ...state.favorites].slice(0, 12);
    saveState();
    renderLocationLists();
    updateFavoriteButton();
}

function updateFavoriteButton() {
    const active = state.currentLocation && state.favorites.some(item => sameLocation(item, state.currentLocation));
    elements.favBtn.innerHTML = active
        ? '<i class="fa-solid fa-star"></i>'
        : '<i class="fa-regular fa-star"></i>';
    elements.favBtn.title = active ? 'Remove from favorites' : 'Add to favorites';
    elements.favBtn.setAttribute('aria-label', elements.favBtn.title);
}

function renderLocationLists() {
    renderCityList(elements.favoritesList, state.favorites, true);
    renderCityList(elements.recentList, state.recent, false);
}

function renderCityList(container, locations, removable) {
    container.replaceChildren();
    if (!locations.length) {
        const empty = document.createElement('li');
        empty.className = 'empty-list';
        empty.textContent = removable ? 'No favorite cities yet.' : 'No recent searches yet.';
        container.appendChild(empty);
        return;
    }

    locations.forEach(location => {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${location.name}${location.country ? `, ${location.country}` : ''}`;
        item.appendChild(label);
        item.addEventListener('click', () => loadWeatherByCoordinates(location.lat, location.lon));

        if (removable) {
            const remove = document.createElement('button');
            remove.className = 'remove-favorite';
            remove.type = 'button';
            remove.title = `Remove ${location.name}`;
            remove.setAttribute('aria-label', remove.title);
            remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            remove.addEventListener('click', event => {
                event.stopPropagation();
                state.favorites = state.favorites.filter(itemLocation => !sameLocation(itemLocation, location));
                saveState();
                renderLocationLists();
                updateFavoriteButton();
            });
            item.appendChild(remove);
        }

        container.appendChild(item);
    });
}

function sameLocation(a, b) {
    return Number(a.lat).toFixed(3) === Number(b.lat).toFixed(3)
        && Number(a.lon).toFixed(3) === Number(b.lon).toFixed(3);
}

function useCurrentLocation() {
    if (!navigator.geolocation) {
        showError('Location unavailable', 'Your browser does not support geolocation.', useCurrentLocation);
        return;
    }

    setLoading(true);
    navigator.geolocation.getCurrentPosition(
        position => {
            setLoading(false);
            loadWeatherByCoordinates(position.coords.latitude, position.coords.longitude);
        },
        error => {
            setLoading(false);
            const messages = {
                1: 'Location permission was denied. Allow location access in your browser settings.',
                2: 'Your location could not be determined.',
                3: 'Location request timed out. Please try again.'
            };
            showError('Location unavailable', messages[error.code] || 'Could not access your location.', useCurrentLocation);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
    );
}

function setDynamicBackground(condition, icon) {
    const allClasses = ['bg-sunny', 'bg-clouds', 'bg-rain', 'bg-snow', 'bg-thunderstorm', 'bg-mist', 'bg-night'];
    elements.body.classList.remove(...allClasses);

    const isNight = icon.endsWith('n');
    const normalized = condition.toLowerCase();
    let className = 'bg-sunny';

    if (isNight) className = 'bg-night';
    else if (normalized.includes('thunder')) className = 'bg-thunderstorm';
    else if (normalized.includes('rain') || normalized.includes('drizzle')) className = 'bg-rain';
    else if (normalized.includes('snow')) className = 'bg-snow';
    else if (['mist', 'fog', 'haze', 'smoke', 'dust', 'sand', 'ash', 'squall', 'tornado'].some(value => normalized.includes(value))) className = 'bg-mist';
    else if (normalized.includes('cloud')) className = 'bg-clouds';

    elements.body.classList.add(className);
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveState();
}

function applyTheme() {
    elements.html.dataset.theme = state.theme;
    elements.themeToggle.innerHTML = state.theme === 'dark'
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
}

async function toggleUnits() {
    state.units = state.units === 'metric' ? 'imperial' : 'metric';
    elements.unitToggle.textContent = state.units === 'metric' ? '°C' : '°F';
    saveState();
    if (state.currentLocation) {
        await loadWeatherByCoordinates(state.currentLocation.lat, state.currentLocation.lon, { addRecent: false });
    }
}

function startLocationClock(timezone) {
    clearInterval(state.clockTimer);
    const update = () => {
        const now = new Date(Date.now() + timezone * 1000);
        elements.currentDate.textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        }).format(now);
        elements.currentTime.textContent = new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).format(now);
    };
    update();
    state.clockTimer = setInterval(update, 1000);
}

function scheduleAutoRefresh() {
    clearInterval(state.refreshTimer);
    state.refreshTimer = setInterval(() => {
        if (navigator.onLine && state.currentLocation) {
            loadWeatherByCoordinates(state.currentLocation.lat, state.currentLocation.lon, { addRecent: false });
        }
    }, 10 * 60 * 1000);
}

function shiftedDate(unixSeconds, timezone) {
    return new Date((Number(unixSeconds) + Number(timezone || 0)) * 1000);
}

function formatUnixTime(unixSeconds, timezone) {
    if (!unixSeconds) return '--:--';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: 'UTC', hour: '2-digit', minute: '2-digit'
    }).format(shiftedDate(unixSeconds, timezone));
}

function formatUnixDate(unixSeconds, timezone, options) {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options })
        .format(shiftedDate(unixSeconds, timezone));
}

function capitalize(value) {
    const text = String(value || '').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function setLoading(show) {
    elements.loader.classList.toggle('hidden', !show);
    elements.searchBtn.disabled = show;
    elements.geoBtn.disabled = show;
}

function showError(title, message, retryAction = null) {
    state.retryAction = retryAction;
    elements.errorTitle.textContent = title;
    elements.errorMessage.textContent = message;
    elements.retryBtn.classList.toggle('hidden', typeof retryAction !== 'function');
    elements.errorModal.classList.remove('hidden');
}

function hideError() {
    elements.errorModal.classList.add('hidden');
}

function updateOnlineStatus() {
    elements.offlineBanner.classList.toggle('hidden', navigator.onLine);
    if (navigator.onLine && state.currentLocation) {
        loadWeatherByCoordinates(state.currentLocation.lat, state.currentLocation.lon, { addRecent: false });
    }
}

function bindEvents() {
    elements.searchForm.addEventListener('submit', event => {
        event.preventDefault();
        loadWeatherByCity(elements.searchInput.value);
    });
    elements.geoBtn.addEventListener('click', useCurrentLocation);
    elements.themeToggle.addEventListener('click', toggleTheme);
    elements.unitToggle.addEventListener('click', toggleUnits);
    elements.favBtn.addEventListener('click', toggleFavorite);
    elements.retryBtn.addEventListener('click', () => {
        hideError();
        if (typeof state.retryAction === 'function') state.retryAction();
    });
    elements.errorModal.addEventListener('click', event => {
        if (event.target === elements.errorModal) hideError();
    });
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
}

async function initialize() {
    applyTheme();
    elements.unitToggle.textContent = state.units === 'metric' ? '°C' : '°F';
    renderLocationLists();
    bindEvents();
    updateOnlineStatus();

    try {
        getApiKey();
    } catch (error) {
        showError('API key required', error.message);
        setLoading(false);
        return;
    }

    let lastLocation = null;
    try {
        lastLocation = JSON.parse(localStorage.getItem(STORAGE_KEYS.lastLocation) || 'null');
    } catch {
        lastLocation = null;
    }

    if (lastLocation?.lat != null && lastLocation?.lon != null) {
        await loadWeatherByCoordinates(lastLocation.lat, lastLocation.lon, { addRecent: false });
    } else {
        await loadWeatherByCity('Bengaluru');
    }
}

initialize();
