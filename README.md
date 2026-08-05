# SkyFlow Weather

A responsive weather dashboard built with HTML, CSS and JavaScript. It works with VS Code Live Server.

## Features

- Search any city and press Enter or the arrow button
- Current location through the browser Geolocation API
- Current weather, feels-like temperature, humidity, wind, pressure and visibility
- Air-quality status
- 3-hour forecast cards and a 5-day forecast
- Celsius/Fahrenheit toggle
- Dark/light theme
- Dynamic weather backgrounds
- Recent searches and favorite cities saved in Local Storage
- Offline status, loading screen, retries and readable API errors
- Automatic refresh every 10 minutes

## Run with Live Server

1. Open this folder in Visual Studio Code.
2. Install the **Live Server** extension if it is not installed.
3. Open `index.html`.
4. Click **Go Live** in the bottom-right corner, or right-click `index.html` and choose **Open with Live Server**.
5. The app normally opens at a localhost address such as `http://127.0.0.1:5500`.

Geolocation works on localhost. When the browser asks for location permission, choose **Allow**.

## API key

The API key is stored in `config.js`. For a public GitHub or Netlify deployment, do not treat a browser-side API key as secret. Use a restricted/replaceable key and rotate it if it has been shared publicly.
