import { mountDemo } from './demos/registry.js'

const container = document.getElementById('app')
const params = new URLSearchParams(window.location.search)
const key = params.get('demo') ?? 'scene'

mountDemo(key, container)
