import express from 'express'
import ollama from 'ollama'
import cors from 'cors'
import multer from 'multer';
import fs from 'fs';


const uploadDirectory = 'uploads/';
var currentImageFile = "";


const app = express()
const port = 3000

app.use(cors());


if (!fs.existsSync(uploadDirectory)) {
  console.log('The directory doesnt exists');
  fs.mkdirSync(uploadDirectory);
} 


// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    currentImageFile = Date.now() + '-' + file.originalname;
    cb(null, currentImageFile);
    
  }
});

// Create the multer instance
const upload = multer({ storage: storage });

// Set up a route for file uploads
app.post('/api/upload', upload.single('file'), async (req, res) => {
  // Handle the uploaded file
  console.log("upload !!!");
  console.log(currentImageFile);
  let imageInBase64 = toBase64(uploadDirectory + currentImageFile);
  const response = await ollama.chat({
  	model: 'llava',
  	messages: [{ role: 'user', 
        content: 'Please describe this image?', 
        images: [imageInBase64] }],
  })
  console.log(response.message.content);
  res.status(200).json(response.message.content);
});

function toBase64(filePath) {
  const img = fs.readFileSync(filePath);
  return Buffer.from(img).toString('base64');
}


app.get('/api/chat', async (req, res) => {
  console.log('message: ' + req.query.message)
  let msg = req.query.message
  const response = await ollama.chat({
  	model: 'llama2-uncensored:latest',
  	messages: [{ role: 'user', content: msg }],
	return_type: 'markdown'
  })
  console.log(response.message.content)
  res.status(200).json(response.message.content)
})



app.listen(port, () => {
  console.log(`Ollama API Server listening on port ${port}`)
})
