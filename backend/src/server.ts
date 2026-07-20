import app from './app.js'

const PORT = Number(process.env.PORT) || 4000
const HOST = '127.0.0.1'

app.listen(PORT, HOST, () => {
  console.log(`DevPort backend running at http://${HOST}:${PORT}`)
})
