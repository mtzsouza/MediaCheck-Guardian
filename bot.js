// Required Libraries 
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const vision = require('@google-cloud/vision');
const filesystem = require('fs');

// Initialize necessary clients
const client_imageVision = new vision.ImageAnnotatorClient({
    keyFilename: 'PATH/TO/YOUR/GOOGLE/CREDENTIAL.json',
});

const client_wpp = new Client({
    authStrategy: new LocalAuth()
});

// Generates QR-Code for authentication
client_wpp.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

// Displays a message when client_wpp is ready
client_wpp.on('ready', () => {
    console.log('WhatsApp Web is ready!');
});

// Listens for all created messages (including your own)
client_wpp.on('message_create', async message => {
    if (message.hasMedia) {
        // Receive media
        media = await message.downloadMedia();
        fileType = media.mimetype.split("/")[0];
        fileExtension = media.mimetype.split("/")[1];

        if (fileType == "image") {
            // Create a unique filename
            fileName = "image_" + Date.now() + "." + fileExtension;

            // Download image
            filesystem.writeFile("./images/" + fileName, media.data, {encoding: "base64"}, (err) => {
                // Check for error
                if (err) {
                    console.error("Error writing file:", err);
                } else {
                    console.log("Media saved as: ", fileName);
                }
            });

            // Retry mechanism to avoid crashing
            let success = false;
            for (let i = 0; i < 3; i++) {
                try {
                    // Performs safe search detection on the image
                    const [result] = await client_imageVision.safeSearchDetection("./images/" + fileName);
                    const detections = result.safeSearchAnnotation;

                    let adult = (detections.adult == "LIKELY" || detections.adult == "VERY_LIKELY") ? true : false;
                    let medical = (detections.medical == "LIKELY" || detections.medical == "VERY_LIKELY") ? true : false;
                    let spoof = (detections.spoof == "LIKELY" || detections.spoof == "VERY_LIKELY") ? true : false;
                    let violence = (detections.violence == "LIKELY" || detections.violence == "VERY_LIKELY") ? true : false;
                    let racy = (detections.racy == "LIKELY" || detections.racy == "VERY_LIKELY") ? true : false;

                    // Remove image from WhatsApp if innapropriate
                    if (adult || medical || spoof || violence || racy) {
                        message.delete();
                        console.log("Media removed from chat.")
                    }

                    success = true;
                } catch(err) {
                    console.log("Image not yet downloaded. Retrying " + (i+1) + "/3");
                }

                if (success) {
                    break;
                } else {
                    // Wait 1 second to try again
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            // Delete image from local files
            filesystem.unlink("./images/" + fileName, (err) => {
                if (err) {
                    console.error("Error deleting file: ", err);
                } else {
                    console.log("File deleted from storage.\n")
                }
            });
        }
    }
});

client_wpp.initialize();
