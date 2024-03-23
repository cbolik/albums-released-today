/**
 * Song Search JS portions
 * 
 * Copyright (C) 2021 Christian Bolik
 */


// An Album object. Contains only the album attributes needed by this app.
class Album {
  constructor(releaseDate, name, artist, imageUrl, uri, href) {
    this.releaseDate = releaseDate;
    this.name = name;
    this.artist = artist;
    this.imageUrl = imageUrl;
    this.uri = uri;
    this.href = href;
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
      setInnerHTML("users_albums", `Found ${albumsList.length} saved albums. <button onclick="reloadAlbums()">Reload</button>`);
    }

    populateTodaysAlbums();
    return;
  }

  if (access_token && state != null) {

    albumsByDate.clear();
    let gotError = false;
    
    while ((offset < totalItems || totalItems === -1) && !gotError) {
      let url = "https://api.spotify.com/v1/me/albums";
      url += "?market=from_token";
      url += "&offset=" + (offset || 0);
      url += "&limit=" + (limit || 20);
      //console.log(`Getting albums ${offset} to ${offset + limit - 1}`);

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
        gotError = true;
        spotifyGetAccessToken();
      }
    }

    if (!gotError) {
      // for (let [key, value] of albumsByDate) {
      //   console.log(key, value);
      // }
      localStorage.setItem("albumsByDate", JSON.stringify(Array.from(albumsByDate.entries())));
      localStorage.setItem("albumsList", JSON.stringify(albumsList));

      setInnerHTML("users_albums", `Found ${totalItems} saved albums. <button onclick="reloadAlbums()">Reload</button>`);
      populateTodaysAlbums();
    }
  } else {
    spotifyGetAccessToken();
  }
}

const reloadAlbums = () => {
  localStorage.removeItem("albumsByDate");
  localStorage.removeItem("albumsList");
  location.reload();
}

const addAlbumToMap = (album) => {
  let releaseDate = album.album.release_date;
  let imageUrl = album.album.images[1].url;
  let name = album.album.name;
  let artist = album.album.artists[0].name;
  let uri = album.album.uri;
  let href = album.album.external_urls.spotify;

  //console.log(`Album: ${name} by ${artist}, released: ${releaseDate}`)

  let dateElems = releaseDate.split("-");
  if (dateElems.length === 3) {
    let newAlbum = new Album(releaseDate, name, artist, imageUrl, uri, href);
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
      //console.log(`Not adding to map: Album ${name} by ${artist}, released: ${releaseDate}`);
    }  
  }
}

const addAlbumToList = (album) => {
  let releaseDate = album.album.release_date;
  let imageUrl = album.album.images[1].url;
  let name = album.album.name;
  let artist = album.album.artists[0].name;
  let uri = album.album.uri;
  let href = album.album.external_urls.spotify;

  let newAlbum = new Album(releaseDate, name, artist, imageUrl, uri, href);
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
  //let todaysMonthDay = "-03-02";
  let todaysYear = getTodaysYear();
  let todaysAlbumsList = albumsByDate.get(todaysMonthDay);
  if (todaysAlbumsList && todaysAlbumsList.length > 0) {
    let todaysAlbumsListElem = document.getElementById("albums_released_today");
    todaysAlbumsListElem.innerHTML = "";
    for (let album of todaysAlbumsList) {
      let newItem = document.createElement("li");
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      if (yearsAgo === 0) {
        addAlbumHtml(album, newItem, `Released today <i class="fa-solid fa-fire icon"></i>:`);
      } else {
        addAlbumHtml(album, newItem, `Released ${yearsAgo} years ago today, in ${releaseYear}:`);
      }
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
    } else if (day === 3) {
      suffix = "rd";
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
      let releaseYear = album.releaseDate.split("-")[0];
      let yearsAgo = todaysYear - releaseYear;
      let newItem = document.createElement("li");
      addAlbumHtml(album, newItem, `Released on ${album.releaseDate} (${yearsAgo} years ago):`);
      todaysAlbumsListElem.appendChild(newItem);
    }
  }
}

const addAlbumHtml = (album, elem, text) => {
  // cut off " (..." from album name:
  const albumName = album.name.replace(/ [\(\[].*$/, "");
  let wikipediaUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${albumName}%20${album.artist}`;
  let songSearchUrl = `https://songsearch.cbolik.net/?artist=${album.artist}&album=${albumName}`;
  if (isMobileOrTablet()) {
    albumLink = album.href;
  } else {
    albumLink = album.uri;
  }
  elem.innerHTML = text
    + `<br><i>${album.artist}: ${albumName}</i> &nbsp; <a href="${wikipediaUrl}" ${!isMobileOrTablet() ? "target=_blank" : ""} class="icon-link"><i class="fa-brands fa-wikipedia-w icon"></i></a>`
    + `&nbsp; <a href="${songSearchUrl}" ${!isMobileOrTablet() ? "target=_blank" : ""} class="icon-link"><i class="fa-solid fa-s icon"></i></a>`
    + `<br><a href="${albumLink}"><img src="${album.imageUrl}"></a>`;
  return elem;
}

const isMobileOrTablet = () => {
  let check = false;
  (function (a) {
    if (
      /(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(
        a
      ) ||
      /1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(
        a.substr(0, 4)
      )
    )
      check = true;
  })(navigator.userAgent || navigator.vendor || window.opera);
  return check;
};

const getTodaysMonthDay = () => {
  // Get today's date
  var today = new Date();

  // Extract month, and day
  var month = (today.getMonth() + 1).toString().padStart(2, '0'); // Month is zero-based
  var day = today.getDate().toString().padStart(2, '0');

  // Format the suffix string as -MM-DD
  var formattedDate = '-' + month + '-' + day;

  //console.log("Today's date suffix: " + formattedDate);
  return formattedDate;
}

const getTodaysYear = () => {
  // Get today's date
  var today = new Date();

  // Extract month, and day
  var year = today.getFullYear();

  return year;
}