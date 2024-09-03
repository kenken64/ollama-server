import express from 'express'
import ollama from 'ollama'
import cors from 'cors'
import multer from 'multer';
import fs from 'fs';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config'
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { OllamaEmbeddings } from "@langchain/ollama";
import { loadQAStuffChain } from "langchain/chains";
import { Document } from "langchain/document";
import { Ollama } from "@langchain/ollama";

const uploadDirectory = 'uploads/';
const uploadPDFDirectory = 'pdf/';

var currentImageFile = "";
var currentPDFFile = "";
console.log(process.env.PINECONE_API_KEY);
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
});


try{
  await pc.createIndex({
    name: process.env.PINECONE_INDEX_NAME,
    dimension: 4096, // Replace with your model dimensions
    metric: 'euclidean', // Replace with your model metric
    spec: { 
        serverless: { 
            cloud: 'aws', 
            region: 'us-east-1' 
        }
    } 
  });
}catch(e){
  console.log('Error creating index!');
  var index = pc.Index(process.env.PINECONE_INDEX_NAME)
}


const app = express()
const port = 3000

app.use(cors());


if (!fs.existsSync(uploadDirectory)) {
  console.log('The directory doesnt exists');
  fs.mkdirSync(uploadDirectory);
} 

if(!fs.existsSync(uploadPDFDirectory)) {
  console.log("This pdf directory doesnt exists !");
  fs.mkdirSync(uploadPDFDirectory);
}


// Set up storage for uploaded files
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    currentImageFile = Date.now() + '-' + file.originalname;
    cb(null, currentImageFile);
    
  }
});

const storagePDF = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPDFDirectory);
  },
  filename: (req, file, cb) => {
    currentPDFFile = Date.now() + '-' + file.originalname;
    cb(null, currentPDFFile);
    
  }
});
// Create the multer instance
const upload = multer({ storage: storage });
const uploadPDF = multer({ storage: storagePDF });

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

// Set up a route for pdf file uploads
app.post('/api/pdf-upload', uploadPDF.single('pdf-file'), async (req, res) => {
  // Handle the uploaded file
  console.log("upload !!!");
  console.log(currentPDFFile);
  console.log(uploadPDFDirectory + currentPDFFile);
  const loader = new PDFLoader(uploadPDFDirectory + currentPDFFile);
  const docs = await loader.load();
  for (const doc of docs) {
    console.log(`Processing document: ${doc.metadata.source}`);
    const txtPath = doc.metadata.source;
    const text = doc.pageContent;
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
    });
    console.log("Splitting text into chunks...");
    const chunks = await textSplitter.createDocuments([text]);
    console.log(`Text split into ${chunks.length} chunks`);
    console.log(
      `Calling Ollama's Embedding endpoint documents with ${chunks.length} text chunks ...`
    );
    console.log(index);
    const embeddings = new OllamaEmbeddings({
      model: "llama2-uncensored:latest", // Default value
      baseUrl: "http://localhost:11434", // Default value
    });
    const embeddingsArrays = await embeddings.embedDocuments(
      chunks.map((chunk) => chunk.pageContent.replace(/\n/g, " "))
    );
    console.log("Finished embedding documents");
    console.log(
      `Creating ${chunks.length} vectors array with id, values, and metadata...`
    );
    
    //const batchSize = 2;
    let batches = [];
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const vector = {
        id: `${txtPath}_${idx}`,
        values: embeddingsArrays[idx],
        metadata: {
          ...chunk.metadata,
          loc: JSON.stringify(chunk.metadata.loc),
          pageContent: chunk.pageContent,
          txtPath: txtPath,
        },
      };
      console.log("pushing...")
      console.log(vector)
      batches.push(vector);
      // When batch is full or it's the last item, upsert the vectors
      console.log(batches.length)
      console.log(chunk.length)
      
      console.log("...upsert !");
      //if(batches != undefined)
      await index.upsert(batches);
      // Empty the batch
      batches = [];
      
    }
  }
 
  res.status(200).json("I have reviewed the PDF you uploaded and am now familiar with its contents. Feel free to ask me anything related to the document.");
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

app.get('/api/chat-pdf', async (req, res) => {
  let responseResult = '';
  console.log('message: ' + req.query.message)
  let question = req.query.message;
  const queryEmbedding = await new OllamaEmbeddings(
    {
      model: "llama2-uncensored:latest", // Default value
      baseUrl: "http://localhost:11434", // Default value
    }
  ).embedQuery(question);
  console.log(queryEmbedding);
  let queryResponse = await index.query({
      topK: 10,
      vector: queryEmbedding,
      includeMetadata: true,
      includeValues: true,
  });
  console.log(`Found ${queryResponse.matches.length} matches...`);
  console.log(`Asking question: ${question}...`);
  if (queryResponse.matches.length) {
    const llm = new Ollama({
      model: 'llama2-uncensored:latest',
  	  return_type: 'markdown'
    });
    const chain = loadQAStuffChain(llm);
    console.log(queryResponse);
    const concatenatedPageContent = queryResponse.matches
      .map((match) => match.metadata.pageContent)
      .join(" ");

    const result = await chain.invoke({
      input_documents: [new Document({ pageContent: concatenatedPageContent })],
      question: question,
    });
    console.log(`Answer: ${result.text}`);
    responseResult = result.text;
  } else {
    console.log("Since there are no matches, Ollama will not be queried.");
  }
  res.status(200).json(`${responseResult}`);
})


app.listen(port, () => {
  console.log(`Ollama API Server listening on port ${port}`)
})
