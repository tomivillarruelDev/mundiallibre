/* security.js - Configuration Decryption Module */

export const SECRET_KEY = "mundiallibre_secure_salt_2026";
export const ENCRYPTED_TOKEN = "FlcaHRkETlZLBhMWN1FJQRgTCzYVBB8AfQgSWkIZBR1eRk4cHgYSF1NpEQFQQBpLPhoTHwQ+UVUfVQkbQAcLEgUaAAYXCnEQCg5aHRArXBddWzpQAAZVVRcIVVwAVVgPU0YEO0IBWkBAU2pKBVhGbVAHHVsMGwcCDBIYQgQSFkdzUQ4GDDsBfUlDVRU5UQUBU1VHDAZbVQ9eWQNHXWxGBFtBQ1ZnFVcPRWwQHBBdCAxMXksADggNV0BcbkRRVEEUV2xHUwoSbwZWAlJZQlxWWFNfDUtOUAw5AQQOECcXM1FbThwrRkBBDEJaAgUdAAEaAAYIAyZdChESXQEsAw4eACwcQFpGTwg=";

/**
 * Decrypts a secure base64-XOR encoded string
 * @param {string} encoded 
 * @returns {Object|null} Decrypted JSON object
 */
export function decrypt(encoded) {
    try {
        const decoded = atob(encoded);
        let result = "";
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ SECRET_KEY.charCodeAt(i % SECRET_KEY.length);
            result += String.fromCharCode(charCode);
        }
        return JSON.parse(result);
    } catch (e) {
        console.error("Failed to decrypt token:", e);
        return null;
    }
}
