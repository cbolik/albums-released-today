# Spotify Authentication Migration Plan

## Overview
Migrate Albums Released Today from Spotify's deprecated **Implicit Grant** flow to the **Authorization Code with PKCE** flow, as required by Spotify's updated authentication requirements.

**Strategy:** Fully client-side implementation (no backend changes needed)

**Related Issue:** #1
**References:**
- [Spotify PKCE Flow Documentation](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow)
- [Migration Guide](https://developer.spotify.com/documentation/web-api/tutorials/migration-implicit-auth-code)

---

## Current Implementation Analysis

### What's Currently Used (Implicit Grant)
- **Flow:** Client-side only, returns access token directly in URL hash
- **Token Location:** `window.location.hash` (e.g., `#access_token=...&state=...`)
- **Security:** Less secure (token exposed in browser history, logs)
- **Token Refresh:** Not supported (requires re-authentication)
- **Code Locations:**
  - [public/scripts.js:39-47](public/scripts.js#L39-L47) - `getHashParams()` parses hash fragments
  - [public/scripts.js:74-86](public/scripts.js#L74-L86) - `spotifyGetAccessToken()` redirects to implicit grant endpoint
  - [public/scripts.js:88-170](public/scripts.js#L88-L170) - `spotifyGetUsersSavedAlbums()` handles callback and fetches albums
  - [public/scripts.js:71](public/scripts.js#L71) - Base64 encoded client ID

### What Needs to Change (PKCE Flow)
- **Flow:** Uses authorization code + code verifier/challenge
- **Token Location:** Query parameters (`?code=...&state=...`), then exchanged for token via **client-side** API call
- **Security:** More secure (code can only be used once, requires verifier)
- **Token Refresh:** Supports refresh tokens (optional for this implementation)
- **Backend:** ✅ **Not required** - PKCE is designed for public clients and Spotify's token endpoint supports CORS

---

## Why Client-Side PKCE Works

PKCE (Proof Key for Code Exchange) was specifically designed for public clients like SPAs where storing secrets isn't possible. Key points:

1. **No Client Secret Needed:** PKCE replaces the client secret with a dynamically generated code verifier
2. **Spotify Supports CORS:** The token endpoint allows direct browser calls for PKCE flows
3. **Secure by Design:** Even if an attacker intercepts the authorization code, they can't use it without the code verifier
4. **Officially Recommended:** Spotify explicitly recommends this approach for single-page applications

**Benefits for this project:**
- ✅ No backend/serverless infrastructure needed
- ✅ Current static file hosting deployment works as-is
- ✅ Zero additional costs
- ✅ Simpler architecture

---

## Migration Steps

### 1. Frontend Changes (public/scripts.js)

#### 1.1 Replace Hash-Based Token Parsing
**Remove:**
- [public/scripts.js:39-47](public/scripts.js#L39-L47) - `getHashParams()` function (no longer needed)

**Add:**
- `getQueryParams()` - Parse query string for authorization code
- Handle `?code=...&state=...` instead of `#access_token=...`

**Implementation:**
```javascript
const getQueryParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get('code'),
    state: params.get('state'),
    error: params.get('error')
  };
};
```

#### 1.2 Implement PKCE Helper Functions
**New functions needed:**

```javascript
// Generate code verifier (cryptographically random, 43-128 chars)
const generateCodeVerifier = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
};

// Generate code challenge from verifier (SHA-256 hash, base64url encoded)
const generateCodeChallenge = async (verifier) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
};

// Base64URL encoding helper (no padding, URL-safe)
const base64URLEncode = (buffer) => {
  const base64 = btoa(String.fromCharCode(...buffer));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
};
```

#### 1.3 Update Authorization Flow
**Modify:** [public/scripts.js:74-86](public/scripts.js#L74-L86) - `spotifyGetAccessToken()`

**Changes:**
```javascript
const spotifyGetAccessToken = async () => {
  const scope = "user-library-read";
  const state = generateRandomString(16);

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store state and verifier for callback validation
  localStorage.setItem('spotify_auth_state', state);
  localStorage.setItem('spotify_code_verifier', codeVerifier);

  // Build authorization URL with PKCE parameters
  let url = "https://accounts.spotify.com/authorize";
  url += "?response_type=code";  // Changed from 'token'
  url += "&client_id=" + encodeURIComponent(atob(SPOTIFY_CLIENT_ID));
  url += "&scope=" + encodeURIComponent(scope);
  url += "&redirect_uri=" + encodeURIComponent(SPOTIFY_REDIRECT_URI);
  url += "&state=" + encodeURIComponent(state);
  url += "&code_challenge=" + encodeURIComponent(codeChallenge);
  url += "&code_challenge_method=S256";

  window.location = url;
};
```

#### 1.4 Implement Token Exchange (Client-Side)
**New function:**

```javascript
const exchangeCodeForToken = async (code, codeVerifier) => {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: atob(SPOTIFY_CLIENT_ID),
      code_verifier: codeVerifier
    })
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`);
  }

  return await response.json();
};
```

#### 1.5 Update Album Fetching Flow
**Modify:** [public/scripts.js:88-170](public/scripts.js#L88-L170) - `spotifyGetUsersSavedAlbums()`

**Changes:**
```javascript
const spotifyGetUsersSavedAlbums = async () => {
  let offset = 0;
  let limit = 50;
  let totalItems = -1;
  let allData = [];

  // Check for cached data first
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

  // Check for authorization code in URL
  const params = getQueryParams();
  const code = params.code;
  const state = params.state;
  const error = params.error;
  const storedState = localStorage.getItem('spotify_auth_state');
  const codeVerifier = localStorage.getItem('spotify_code_verifier');

  // Handle authorization errors
  if (error) {
    console.error("Spotify authorization error:", error);
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('spotify_code_verifier');
    setInnerHTML("users_albums", `Authorization error: ${error}`);
    return;
  }

  let access_token = null;

  // If we have a code, exchange it for a token
  if (code && state != null && state === storedState && codeVerifier) {
    // Clean up stored values
    localStorage.removeItem('spotify_auth_state');
    localStorage.removeItem('spotify_code_verifier');

    try {
      // Exchange authorization code for access token
      const tokenData = await exchangeCodeForToken(code, codeVerifier);
      access_token = tokenData.access_token;

      // Clean up URL by removing query parameters
      window.history.replaceState({}, document.title, window.location.pathname);

    } catch (err) {
      console.error("Error during token exchange:", err);
      setInnerHTML("users_albums", `Failed to exchange authorization code for token. Please try again.`);
      return;
    }
  }

  // If we don't have a token, redirect to authorization
  if (!access_token) {
    spotifyGetAccessToken();
    return;
  }

  // Fetch albums with the access token
  albumsByDate.clear();
  let gotError = false;

  while ((offset < totalItems || totalItems === -1) && !gotError) {
    let url = "https://api.spotify.com/v1/me/albums";
    url += "?market=from_token";
    url += "&offset=" + (offset || 0);
    url += "&limit=" + (limit || 20);

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
      console.error("Failed to fetch albums:", response.status);
      setInnerHTML("users_albums", `Failed to fetch albums. Please try again.`);
    }
  }

  if (!gotError) {
    localStorage.setItem("albumsByDate", JSON.stringify(Array.from(albumsByDate.entries())));
    localStorage.setItem("albumsList", JSON.stringify(albumsList));

    setInnerHTML("users_albums", `Found ${totalItems} saved albums. <button onclick="reloadAlbums()">Reload</button>`);
    populateTodaysAlbums();
  }
};
```

**Files to modify:**
- [public/scripts.js](public/scripts.js) - All changes are in this file only!

---

## Testing Plan

### 2.1 Local Testing
1. Run `npm start` and open http://localhost:8000
2. Clear localStorage to ensure fresh authentication
3. Page load should trigger authorization redirect
4. Verify redirect to Spotify login
5. After authorization, verify:
   - Redirect back to app with `?code=...&state=...` in URL
   - Token exchange completes successfully
   - Albums start loading with progress indicator
   - All albums load successfully
   - URL gets cleaned up (query params removed)
   - Albums for today's date are displayed (or random albums if none)
6. Test error cases:
   - Deny authorization at Spotify (should handle gracefully)
   - Clear localStorage and test state validation
   - Test with invalid/expired authorization code

### 2.2 Mobile/Desktop Testing
- Test on mobile browsers (iOS Safari, Android Chrome)
- Test on desktop browsers (Chrome, Firefox, Safari)
- Verify existing mobile/tablet detection logic still works for Spotify URIs vs HTTPS links

### 2.3 Spotify Developer Dashboard
Before deployment, update your app settings:
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Select your app (Albums Released Today)
3. Edit Settings → Redirect URIs
4. Ensure these URIs are whitelisted:
   - `http://localhost:8000` (for local testing)
   - Your production URL (wherever the app is deployed)
5. Save changes

### 2.4 Production Deployment
1. Commit changes to master
2. Deploy to your hosting environment
3. Test production URL
4. Monitor browser console for any CORS or API errors
5. Test with multiple users/accounts if possible

---

## Security Considerations

### 3.1 PKCE Implementation
✅ **Code verifier:** Generated using `crypto.getRandomValues()` (cryptographically secure)
✅ **Length:** 43 characters (base64url encoded from 32 bytes)
✅ **Code challenge:** SHA-256 hash of verifier, base64url encoded
✅ **Storage:** Stored in localStorage only temporarily, cleared after token exchange

### 3.2 State Parameter
✅ **CSRF Protection:** Random state generated and validated on callback
✅ **Validation:** State must match before proceeding with token exchange

### 3.3 Client ID Exposure
✅ **Acceptable:** Client ID in frontend code is normal for public SPAs
✅ **No Secret:** PKCE doesn't require client secret
✅ **Security:** Code verifier provides the security, not the client ID

### 3.4 Token Handling
✅ **No persistent storage for tokens:** Access tokens stay in function scope/memory only
✅ **URL cleanup:** Query parameters removed from URL after processing
✅ **Error handling:** Failed exchanges don't expose sensitive data
✅ **Album caching:** Only album data (not tokens) stored in localStorage

---

## Rollout Strategy

### 4.1 Development
1. Create feature branch: `git checkout -b feature/spotify-pkce-auth`
2. Implement changes to [public/scripts.js](public/scripts.js)
3. Test locally with `npm start`
4. Verify all existing functionality works

### 4.2 Spotify Developer Dashboard Updates
**Before deployment:**
1. Log in to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Select your Albums Released Today app
3. Edit Settings → Redirect URIs
4. Ensure production URL is whitelisted
5. Ensure localhost:8000 is whitelisted for testing

### 4.3 Deployment
1. Merge to master: `git checkout master && git merge feature/spotify-pkce-auth`
2. Push to GitHub: `git push origin master`
3. Deploy to your hosting environment
4. Test production URL immediately
5. Monitor browser console for errors

### 4.4 Backward Compatibility
- **Not needed:** Spotify will deprecate implicit grant for everyone
- **Clean cutover:** New flow replaces old flow completely
- **User impact:** Users will need to re-authenticate once after deployment (cached album data will be preserved)

---

## Files to Modify

**Single file change:**
- [public/scripts.js](public/scripts.js) - All PKCE implementation changes

**No changes needed:**
- ~~app.js~~ - Backend not required for PKCE
- ~~package.json~~ - No new dependencies needed
- ~~.env~~ - No environment configuration needed

---

## Success Criteria

- [ ] PKCE helper functions implemented (code verifier, challenge generation, base64url encoding)
- [ ] Authorization flow updated to use `response_type=code` with PKCE parameters
- [ ] Token exchange implemented client-side with proper error handling
- [ ] Album fetching flow migrated from hash-based to query parameter-based token handling
- [ ] State validation working correctly (CSRF protection)
- [ ] Users can authenticate with Spotify successfully
- [ ] All saved albums load correctly
- [ ] Albums for today's date display correctly
- [ ] Random albums display when no albums match today's date
- [ ] URL cleanup after callback (query params removed)
- [ ] All existing functionality remains intact (date navigation, reload button, Wikipedia/SongSearch links)
- [ ] Works on desktop browsers (Chrome, Firefox, Safari)
- [ ] Works on mobile browsers (iOS Safari, Android Chrome)
- [ ] Mobile/tablet detection still works for Spotify URI vs HTTPS links
- [ ] Spotify Developer Dashboard redirect URIs configured correctly
- [ ] Deployed successfully to production
- [ ] Production testing completed with no console errors
- [ ] No security vulnerabilities introduced

---

## Token Storage Approach

For this migration, we're using a **memory-only** approach for access tokens:
- Access token kept only in function scope during the album fetching process
- Never stored in localStorage or sessionStorage
- User must re-authenticate on each page visit

**Rationale:**
- This app is typically used once per day to check albums
- Additional complexity of session storage or refresh tokens not warranted
- Most secure approach - no token persistence
- Album data (not tokens) is cached in localStorage for performance

**Future Enhancement:**
If users request less frequent re-authentication, consider implementing sessionStorage for access tokens (similar to the SongSearch app) or refresh token implementation. See the SongSearch migration plan for detailed token storage options.

---

## Key Differences from SongSearch Migration

1. **Album Fetching:** This app fetches albums on page load, whereas SongSearch fetches on button click
2. **Token Usage:** Single-use token for batch fetching vs on-demand fetching
3. **Token Storage:** Memory-only approach vs sessionStorage (SongSearch uses sessionStorage)
4. **User Flow:** Automatic authentication on page load if no cached data vs manual button click
5. **API Scope:** `user-library-read` (read saved albums) vs `user-read-currently-playing user-read-recently-played`

---

## Summary

This migration moves Albums Released Today from the deprecated Implicit Grant flow to the modern Authorization Code with PKCE flow using a **fully client-side implementation**. This approach:

- Requires changes to only one file ([public/scripts.js](public/scripts.js))
- Maintains the current static file deployment workflow
- Costs $0 (no backend infrastructure needed)
- Is officially supported and recommended by Spotify for SPAs
- Provides better security than the old implicit grant flow
- **Token storage:** Memory-only approach for maximum security
- **Album caching:** Maintains existing localStorage caching for album data

The implementation adds ~100 lines of code for PKCE functionality while maintaining all existing features.
