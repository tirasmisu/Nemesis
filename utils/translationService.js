const { translate } = require('google-translate-api-x');

/**
 * Translates text to the target language
 * @param {string} text - Text to translate
 * @param {string} targetLang - Target language code (default: 'en')
 * @returns {Promise<string>} Translated text
 */
async function translateText(text, targetLang = 'en') {
    try {
        const result = await translate(text, { to: targetLang });
        return result.text;
    } catch (error) {
        console.error('Translation error:', error);
        throw new Error('Failed to translate text');
    }
}

module.exports = {
    translateText
}; 
