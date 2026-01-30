const fs = require('fs');
const https = require('https');
const path = require('path');

// ----------------------------------------------------
// Configuration
// ----------------------------------------------------

// URL to fetch the list of all card names
const CARD_NAMES_URL = 'https://raw.githubusercontent.com/Omezi42/AnokoroImageFolder/main/all_card_names.txt';

// Base URL for card images (transparent versions)
const IMAGE_BASE_URL = 'https://raw.githubusercontent.com/Omezi42/AnokoroImageFolder/main/images/transparent_cards';

// Output JSON file path
const outputJsonPath = './public/data/card_list.json';

// ----------------------------------------------------

// Ensure directory exists
const outputDir = path.dirname(outputJsonPath);
if (!fs.existsSync(outputDir)){
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log(`Fetching card names from ${CARD_NAMES_URL}...`);

https.get(CARD_NAMES_URL, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        const cardNames = data.split('\n').map(name => name.trim()).filter(name => name.length > 0);
        
        const cardData = cardNames.map(cardName => {
            // Encode card name for URL
            // Note: encodeURIComponent encodes everything, but we need to match how the files are stored/accessed via raw.
            // Raw GitHub user content usually handles standard URL encoding.
            const encodedName = encodeURIComponent(cardName);
            
            return {
                id: cardName,
                name: cardName,
                // Pointing to the GitHub Raw URL for the transparent image
                imageUrl: `${IMAGE_BASE_URL}/${encodedName}.png`
            };
        });

        fs.writeFileSync(outputJsonPath, JSON.stringify(cardData, null, 2));
        console.log(`Successfully generated ${outputJsonPath} with ${cardData.length} cards.`);
    });

}).on('error', (err) => {
    console.error('Error fetching card names:', err);
});