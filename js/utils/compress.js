// =============================================================================
// JS/UTILS/COMPRESS.JS
// Compresses any image file to a JPEG before uploading to Supabase storage.
// Reduces iPhone photos from 8-12MB to 200-400KB — invisible to the user,
// takes under a second, works on all browsers including Safari/iOS.
//
// Usage:
//   const compressed = await compressImage(file);
//   // compressed is a Blob ready to pass to supabase.storage.upload()
// =============================================================================

async function compressImage(file, maxDimension = 1200, quality = 0.78) {
    return new Promise((resolve) => {
        // Pass non-image files through unchanged
        if (!file || !file.type.startsWith('image/')) {
            resolve(file);
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;

            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                // Scale down proportionally if either dimension exceeds max
                if (width > maxDimension || height > maxDimension) {
                    if (width > height) {
                        height = Math.round((height * maxDimension) / width);
                        width = maxDimension;
                    } else {
                        width = Math.round((width * maxDimension) / height);
                        height = maxDimension;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                // White background handles transparent PNGs and HEIC files
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            resolve(file); // Fallback to original
                            return;
                        }
                        console.log(
                            `[compress] ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB`
                        );
                        resolve(blob);
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = () => resolve(file); // Fallback on decode error
        };

        reader.onerror = () => resolve(file); // Fallback on read error
        reader.readAsDataURL(file);
    });
}

window.compressImage = compressImage;
