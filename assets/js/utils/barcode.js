export function generateBarcode() {
    // Generate a random 12-digit UPC barcode
    let barcode = '';
    for (let i = 0; i < 12; i++) {
        barcode += Math.floor(Math.random() * 10).toString();
    }
    return barcode;
}

export function initBarcodeScanner(onScan) {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e) => {
        const currentTime = Date.now();

        // Barcode scanners usually send keys very quickly (less than 30ms apart)
        if (currentTime - lastKeyTime > 100) {
            buffer = '';
        }

        lastKeyTime = currentTime;

        if (e.key === 'Enter') {
            if (buffer.length >= 8) {
                onScan(buffer);
                buffer = '';
            }
        } else if (e.key.length === 1) {
            buffer += e.key;
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
}
