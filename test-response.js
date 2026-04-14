const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const doTest = async () => {
    try {
        const { targetTokens } = require('./backend/angelAPI'); // wait no, can't easily import it like this without auth. I'll just hit my own deployed backend's API if possible, wait no.
    } catch(e) {}
}
