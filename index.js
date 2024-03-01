import express from 'express'
import ollama from 'ollama'
import cors from 'cors'

const app = express()
const port = 3000

app.use(cors());

app.get('/', async (req, res) => {
  console.log('message: ' + req.query.message)
  let msg = req.query.message
  const response = await ollama.chat({
  	model: 'mistral',
  	messages: [{ role: 'user', content: msg }],
  })
  console.log(response.message.content)
  res.status(200).json(response.message.content)
})



app.listen(port, () => {
  console.log(`Ollama API Server listening on port ${port}`)
})
