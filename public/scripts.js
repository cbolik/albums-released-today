/**
 * Song Search JS portions
 * 
 * Copyright (C) 2021 Christian Bolik
 */


// An Album object. Contains only the album attributes needed by this app.
class Album {
  constructor(releaseDate, name, artist, imageUrl, uri) {
    this.releaseDate = releaseDate;
    this.name = name;
    this.artist = artist;
    this.imageUrl = imageUrl;
    this.uri = uri;
  }
}

// A Map keyed by date suffix (in the form "-MM-DD"), and values being Arrays of Albums, sorted by year in ascending order.
// Will contain only albums with a complete release date consisting of year, month, and day.
// Will not contain albums released on January 1st, as for many albums on Spotify this is synonymous with "unknown".
let albumsByDate = new Map();

// An unsorted list of the user's Albums. Used for picking a number of random ones in case no album was released "today".
let albumsList = new Array();

// Convenience function for setting a given element's inner HTML
const setInnerHTML = (id, value) => {
  return document.getElementById(id).innerHTML = value;
};

/**
 * Obtains parameters from the hash part of the current URL (i.e. following "#").
 * Used for Spotify API's Implicit Grant flow. E.g. the access token is encoded here.
 * See https://developer.spotify.com/documentation/web-api/tutorials/implicit-flow
 * @return Object
 */
const getHashParams = () => {
  let hashParams = {};
  let e, r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1);
  while ( e = r.exec(q)) {
      hashParams[e[1]] = decodeURIComponent(e[2]);
  }
  return hashParams;
}

/**
 * Generates a random string containing numbers and letters
 * Used for Spotify API's Implicit Grant flow.
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
const generateRandomString = (length) => {
  let text = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const getRedirectURI = (loc) => {
  let uri = loc.origin + loc.pathname;
  return uri.replace(/\/$/, "");
}

// Update here, encode value copied from Spotify Dev via btoa() in browser console
const SPOTIFY_CLIENT_ID = "MWIxZDQwYTYxM2U1NDdmMGE2ZjNiMGVjN2U2ZDExNDE=";
const SPOTIFY_REDIRECT_URI = getRedirectURI(window.location);

const spotifyGetAccessToken = () => {
  // authorize user and get access token
  let scope = "user-library-read";
  let url = "https://accounts.spotify.com/authorize";
  let state = generateRandomString(16);

  url += "?response_type=token";
  url += "&client_id=" + encodeURIComponent(atob(SPOTIFY_CLIENT_ID));
  url += "&scope=" + encodeURIComponent(scope);
  url += "&redirect_uri=" + encodeURIComponent(SPOTIFY_REDIRECT_URI);
  url += "&state=" + encodeURIComponent(state);
  window.location = url;
}

const spotifyGetUsersSavedAlbums = async () => {
  let offset = 0;
  let limit = 50;
  let totalItems = -1;
  let allData = [];

  let params = getHashParams();
  let access_token = params.access_token,
    state = params.state;

  // read albumsByDate from local storage
  let albumsByDateStr = localStorage.getItem("albumsByDate");
  if (albumsByDateStr) {
    let albumsByDateArr = JSON.parse(albumsByDateStr);
    albumsByDate = new Map(albumsByDateArr);

    let albumsListStr = localStorage.getItem("albumsList");
    if (albumsListStr) {
      albumsList = JSON.parse(albumsListStr);
      setInnerHTML("users_albums", `Found ${albumsList.length} saved albums.`);
    }

    populateTodaysAlbums();
    return;
  }

  if (access_token && state != null) {

    albumsByDate.clear();
    
    while (offset < totalItems || totalItems === -1) {
      let url = "https://api.spotify.com/v1/me/albums";
      url += "?market=from_token";
      url += "&offset=" + (offset || 0);
      url += "&limit=" + (limit || 20);
      console.log(`Getting albums ${offset} to ${offset + limit - 1}`);

      const response = await fetch(url, {
        headers: {
          Authorization: "Bearer " + access_token,
          Accept: "application/json"
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (!data) {
          console.error("Failed to fetch data from get albums API.")
          break;
        }

        if (totalItems === -1) {
          totalItems = data.total;
        }
        allData = allData.concat(data.items);
        offset += limit;

        for (let album of data.items) {
          addAlbumToMap(album);
          addAlbumToList(album);
        }

        setInnerHTML("users_albums", `Loading your saved albums... ${Math.min(offset, totalItems)}/${totalItems}`);
      } else {
        spotifyGetAccessToken();
      }
    }

    for (let [key, value] of albumsByDate) {
      console.log(key, value);
    }
    localStorage.setItem("albumsByDate", JSON.stringify(Array.from(albumsByDate.entries())));
    localStorage.setItem("albumsList", JSON.stringify(albumsList));

    setInnerHTML("users_albums", `Found ${totalItems} saved albums.`);
    populateTodaysAlbums();
  } else {
    spotifyGetAccessToken();
  }
}

const addAlbumToMap = (album) => {
  let releaseDate = album.album.release_date;
  let imageUrl = album.album.images[1].url;
  let name = album.album.name;
  let artist = album.album.artists[0].name;
  let uri = album.album.uri;

  //console.log(`Album: ${name} by ${artist}, released: ${releaseDate}`)

  let dateElems = releaseDate.split("-");
  if (dateElems.length === 3) {
    let newAlbum = new Album(releaseDate, name, artist, imageUrl, uri);
    let key = `-${dateElems[1]}-${dateElems[2]}`;
    if (key !== "-01-01") {
      let curVal = albumsByDate.has(key) ? albumsByDate.get(key) : new Array();
      curVal.push(newAlbum);
      curVal.sort((a, b) => {
        let yearA = a.releaseDate.split("-")[0];
        let yearB = b.releaseDate.split("-")[0];
        return yearB - yearA;
      })
      albumsByDate.set(key, curVal);
    } else {
      console.log(`Not adding to map: Album ${name} by ${artist}, released: ${releaseDate}`);
    }  
  }
}

const addAlbumToList = (album) => {
  let releaseDate = album.album.release_date;
  let imageUrl = album.album.images[1].url;
  let name = album.album.name;
  let artist = album.album.artists[0].name;
  let uri = album.album.uri;

  let newAlbum = new Album(releaseDate, name, artist, imageUrl, uri);
  albumsList.push(newAlbum);
}

const populateAlbumsFromSpotify = (albums_resp) => {
  let num_albums = 0;
  if (albums_resp) {
    num_albums = albums_resp.length;
    
    let todaysMonthDay = getTodaysMonthDay();
    let todaysAlbumsList = document.getElementById("albums_released_today");
    todaysAlbumsList.innerHTML = "";
    let gotOne = false;
    for (let album of albums_resp) {
      if (album.album.release_date.endsWith(todaysMonthDay)) {
        let albumYear = album.album.release_date.split("-")[0];
        //let albumDesc = album.album.name + ", released: " + ;
        let newItem = document.createElement("li");
        newItem.innerHTML = `Released ${getTodaysYear() - albumYear} years ago today:<br><a href="${album.album.uri}"><img src="${album.album.images[1].url}"></a>`;
        todaysAlbumsList.appendChild(newItem);
        gotOne = true;
      }
    }
    if (!gotOne) {
      let newItem = document.createElement("li");
      newItem.textContent = "None";
      todaysAlbumsList.appendChild(newItem);
    }    
  } else {
    setInnerHTML("users_albums", `Albums go here. Huh, no saved albums found though.`)
  }
}

const populateTodaysAlbums = () => {
  let todaysMonthDay = getTodaysMonthDay();
  //let todaysMonthDay = "-10-02";
  let todaysYear = getTodaysYear();
  let todaysAlbumsList = albumsByDate.get(todaysMonthDay);
  if (todaysAlbumsList && todaysAlbumsList.length > 0) {
    let todaysAlbumsListElem = document.getElementById("albums_released_today");
    todaysAlbumsListElem.innerHTML = "";
    for (let album of todaysAlbumsList) {
      let newItem = document.createElement("li");
      newItem.innerHTML = `Released ${todaysYear - album.releaseDate.split("-")[0]} years ago today:<br><a href="${album.uri}"><img src="${album.imageUrl}"></a>`;
      todaysAlbumsListElem.appendChild(newItem);
    }
  } else {
    let todaysAlbumsListElem = document.getElementById("albums_released_today");
    todaysAlbumsListElem.innerHTML = "";
    let newItem = document.createElement("li");
    // Get today's date in the form "December 5th"
    let today = new Date();
    let month = today.toLocaleString('default', { month: 'long' });
    let day = today.getDate();
    let suffix = "th";
    if (day === 1 || day === 21 || day === 31) {
      suffix = "st";
    } else if (day === 2 || day === 22) {
      suffix = "nd";
    }
    newItem.innerHTML = `None of your saved albums were released on ${month} ${day}${suffix}. But how about revisiting one of the following?`;
    todaysAlbumsListElem.appendChild(newItem);

    // pick 3 random albums from albumsList
    let numAlbums = albumsList.length;
    let numToPick = 3;
    let pickedAlbums = new Set();
    for (let i = 0; i < numToPick; i++) {
      let idx = Math.floor(Math.random() * numAlbums);
      while (pickedAlbums.has(idx)) {
        idx = Math.floor(Math.random() * numAlbums);
      }
      pickedAlbums.add(idx);
    }

    // sort the picked albums by release year in descending order
    pickedAlbums = Array.from(pickedAlbums);
    pickedAlbums.sort((a, b) => {
      let yearA = albumsList[a].releaseDate.split("-")[0];
      let yearB = albumsList[b].releaseDate.split("-")[0];
      return yearB - yearA;
    })
       

    for (let idx of pickedAlbums) {
      let album = albumsList[idx];
      let newItem = document.createElement("li");
      newItem.innerHTML = `Released on ${album.releaseDate}:<br><a href="${album.uri}"><img src="${album.imageUrl}"></a>`;
      todaysAlbumsListElem.appendChild(newItem);
    }
  }
}

const getTodaysMonthDay = () => {
  // Get today's date
  var today = new Date();

  // Extract month, and day
  var month = (today.getMonth() + 1).toString().padStart(2, '0'); // Month is zero-based
  var day = today.getDate().toString().padStart(2, '0');

  // Format the suffix string as -MM-DD
  var formattedDate = '-' + month + '-' + day;

  console.log("Today's date suffix: " + formattedDate);
  return formattedDate;
}

const getTodaysYear = () => {
  // Get today's date
  var today = new Date();

  // Extract month, and day
  var year = today.getFullYear();

  return year;
}