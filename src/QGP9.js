const nodepath = require('path')
const Train = require('night-train')
const {ERROR, DEBUG} = require('./error.js')
const Store = require('./store.js')
const Config = require('./config.js')
const configDefault = require('./config-default.js')
const Helper = require('./helper.js')


class QGP9 {
  constructor(config){
    this.root = '.'
    this.config = new Config
    this.config.addObj(configDefault)
    this.trains = new Train([
      'processCollection',
      'processItem',
      'processInstall',
      'processPostInstall',
      'cleanInstall',
      'cleanPostInstall'
    ])
    this.dbLoaded = false
    this.registered = false
  }

  /**
   * Add configuration file. 
   * * chinable
   * * dupllecated ivoking cause merging of config files
   * @param {string} path path of configuration file. Possible extensions are yml, yaml, tml, toml, js, json
   */
  configure (path) {
    this.config.addFile(nodepath.join(this.root, path))
    return this
  }

  /**
   * Set configuration of source directory
   * * Chainable
   * * Final value depend on an order of source and configure
   * @param {string} path path of source directory from current directory
   */
  source (path) {
    // FIXME
    this.config.set('source_dir', path)
    return this
  }

  /**
   * Set root directory where _config.yml located
   * * Chainable
   * @param {string} path
   */
  setRoot (path) {
    this.root = path
    return this
  }

  /**
   * Set backed db
   * * Chainable
   * @param {object} store 
   */
  useStore (store) {
    this.store = store
    return this
  }

  /**
   * Register plugin
   * * Chainable
   * @param {object} plugin
   */
  use (plugin) {
    this.trains.register(plugin)
    return this
  }

  /** 
   * Helper function to run each 'processItem' train
   * @private
   */ 
  async _processItems (h) {
    const type = 'page'
    const items = await h.updatedList({type}).catch(ERROR)
    const plist = []
    for (const item of items) {
      const promise = this.trains.run('processItem', {h, item})
        .catch(ERROR)
      plist.push(promise)
    }
    await Promise.all(plist)
    this.store.save()
  }

  /**
   * @private
   * init function which will be invoked in the begining of any run
   */
  async init() {
    await this.store.load().catch(ERROR)
    this.table = await this.store.itemTable().catch(ERROR)
    this.cache = await this.store.cacheTable().catch(ERROR)

    // Finalize config
    this.config._normalize()

    // register plugin
    if (!this.registered) {
      await this.trains.runAsync('register', this)
        .then(() => { this.registered = true })
        .catch(ERROR)
    }
  }

  /**
   * Run processCollection, processItem, processInstall
   */
  async run () {
    DEBUG(3, 'QGP9::Run')
    const qgp = this
    const checkpoint = this.checkpoint = Date.now()
    const h = new Helper(this)
    DEBUG(3, 'QGP9::Init')
    await this.init().catch(ERROR)
    DEBUG(3, 'QGP9::processCollection')
    await this.trains.run('processCollection', {h, qgp, checkpoint})
      .catch(ERROR)
    DEBUG(3, 'QGP9::processItem')
    await this._processItems(h)
      .catch(ERROR)
    DEBUG(3, 'QGP9::processInstall')
    await this.trains.run('processInstall', {h, qgp, checkpoint})
      .catch(ERROR)
    DEBUG(3, 'QGP9::SaveDB')
    await this.store.save().catch(ERROR)
    DEBUG(3, 'QGP9::DONE')
  }

  /**
   * Run processPostInstall
   */
  async postRun () {
    const qgp = this
    const checkpoint = this.checkpoint = Date.now()
    const h = new Helper(this)
    await this.init().catch(ERROR)
    await this.trains.run('processPostInstall', {h, qgp, checkpoint})
      .catch(ERROR)
  }

  async cleanInstall () {
    const qgp = this
    const checkpoint = this.checkpoint = Date.now()
    const h = new Helper(this)
    await this.init().catch(ERROR)
    // await this.trains.run('cleanInstall', {qgp}).catch(ERROR)
    await this.store.delete().catch(ERROR)
  }

  async cleanPostInstall () {
    const qgp = this
    const checkpoint = this.checkpoint = Date.now()
    const h = new Helper(this)
    await this.init().catch(ERROR)
    await this.trains.run('cleanPostInstall', {h, qgp}).catch(ERROR)
  }
}

module.exports = QGP9
