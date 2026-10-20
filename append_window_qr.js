const fs = require('fs');
let code = fs.readFileSync('public/js/qrcode.min.js', 'utf8');
if (!code.includes('window.QRCode = QRCode')) {
    code += '\nif (typeof window !== "undefined") { window.QRCode = QRCode; }\n';
    fs.writeFileSync('public/js/qrcode.min.js', code, 'utf8');
    console.log('Appended window.QRCode');
} else {
    console.log('Already present');
}
