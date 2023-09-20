/**
 * Song Search JS portions
 * 
 * Copyright (C) 2021 Christian Bolik
 */


 const getValue = (id) => {
  return document.getElementById(id).value;
}

const setValue = (id, value) => {
  return document.getElementById(id).value = value;
};

const setInnerHTML = (id, value) => {
  return document.getElementById(id).innerHTML = value;
};

/**
 * Obtains parameters from the hash of the current URL.
 * Used for Spotify API's Implicit Grant flow.
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

const spotifyCheckForCurrentTrack = () => {
  let params = getHashParams();

  let access_token = params.access_token,
    state = params.state;

  if (access_token && state != null) {
    // get currently playing track
    let url = "https://api.spotify.com/v1/me/player/currently-playing";
    //url += "?market=from_token";
    fetch(url, {
      headers: {
        Authorization: "Bearer " + access_token,
        Accept: "application/json"
      },
    })
      .then((resp) => {
        if (resp.status === 204) {
          return null;
        } else {
          return resp.json();
        }
      })
      .then((data) => {
        if (data) {
          populateFromSpotify(data.item);
        } else {
          spotifyCheckLastPlayedTrack(access_token);
        }
      });
  } else {
    spotifyGetAccessToken();
  }
}

const spotifyGetAccessToken = () => {
  // authorize user and get access token
  let scope = "user-read-currently-playing user-read-recently-played user-library-read";
  let url = "https://accounts.spotify.com/authorize";
  let state = generateRandomString(16);

  url += "?response_type=token";
  url += "&client_id=" + encodeURIComponent(atob(SPOTIFY_CLIENT_ID));
  url += "&scope=" + encodeURIComponent(scope);
  url += "&redirect_uri=" + encodeURIComponent(SPOTIFY_REDIRECT_URI);
  url += "&state=" + encodeURIComponent(state);
  window.location = url;
}

const spotifyCheckLastPlayedTrack = (access_token) => {
  // try to get recently played tracks
  url = "https://api.spotify.com/v1/me/player/recently-played?limit=1";
  fetch(url, {
    headers: {
      Authorization: "Bearer " + access_token,
      Accept: "application/json",
    },
  })
    .then((resp) => {
      console.log(resp.status);
      if (resp.status === 204) {
        return null;
      } else {
        return resp.json();
      }
    })
    .then((data) => {
      if (data) {
        populateFromSpotify(data.items[0].track);
      }
    });
};

const populateFromSpotify = (attr_prefix) => {
  const orig_title = attr_prefix.name;
  // cut off " -..." and " (..."
  const title = orig_title.replace(/ [-\(].*$/, "");
  const orig_album = attr_prefix.album.name;
  // cut off " (..."
  const album = orig_album.replace(/ [\(\[].*$/, "");
  let artist = "";
  const artist_list = []
  // if multiple artists concat them together
  for (let a of attr_prefix.artists) {
    artist += a.name + " ";
    artist_list.push(a.name);
  }
  artist = artist.trimEnd();
  const releaseDate = attr_prefix.album.release_date;
  const releaseYear = releaseDate.split("-")[0];

  setInnerHTML("current_title", `${artist}: "${title}" from album "${album}" (released ${releaseDate})`)
}

const spotifyGetUsersSavedAlbums = async () => {
  let offset = 0;
  let limit = 50;
  let totalItems = -1;
  let allData = [];

  let params = getHashParams();
  let access_token = params.access_token,
    state = params.state;

  if (access_token && state != null) {
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
      //f (response.status === 204) {
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
      //}
    }

    populateAlbumsFromSpotify(allData);
  } else {
    spotifyGetAccessToken();
  }
}

const spotifyGetUsersSavedAlbumsOld = () => {
  let params = getHashParams();
  let access_token = params.access_token,
    state = params.state;

  if (access_token && state != null) {
    let url = "https://api.spotify.com/v1/me/albums";
    url += "?market=from_token";
    url += "&offset=" + (offset || 0);
    url += "&limit=" + (limit || 20);

    fetch(url, {
      headers: {
        Authorization: "Bearer " + access_token,
        Accept: "application/json"
      },
    })
      .then((resp) => {
        if (resp.status === 204) {
          return null;
        } else {
          return resp.json();
        }
      })
      .then((data) => {
        if (data) {
          populateAlbumsFromSpotify(data);
        } else {
          populateAlbumsFromSpotify(null);
        }
      });
  } else {
    spotifyGetAccessToken();
  }
}

const populateAlbumsFromSpotify = (albums_resp) => {
  let num_albums = 0;
  if (albums_resp) {
    num_albums = albums_resp.length
    setInnerHTML("users_albums", `Albums go here. num_albums: ${num_albums}`)
    
  } else {
    setInnerHTML("users_albums", `Albums go here. Huh, no saved albums found though.`)
  }
}

