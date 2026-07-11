;(function () {
  let bridgePortPromise = null
  const bridgeEventHandlers = new Map()
  const LOG_PREFIX = '[satspoll extension]'

  function createLNbitsExtensionClient({extensionId}) {
    const baseUrl = `/api/v1/ext/${extensionId}`

    return {
      context() {
        return bridgeRequest({action: 'context'})
      },

      notifyError(message) {
        return bridgeRequest({
          action: 'ui.notify',
          level: 'negative',
          message: errorMessage(message)
        })
      },

      createPoll(payload) {
        return request(`${baseUrl}/polls`, {
          method: 'POST',
          body: payload
        })
      },

      listPolls() {
        return request(`${baseUrl}/polls`)
      },

      getPoll(pollId) {
        return request(`${baseUrl}/polls/${encodeURIComponent(pollId)}`)
      },

      updatePoll(pollId, payload) {
        return request(`${baseUrl}/polls/${encodeURIComponent(pollId)}`, {
          method: 'PATCH',
          body: payload
        })
      },

      deletePoll(pollId) {
        return request(`${baseUrl}/polls/${encodeURIComponent(pollId)}`, {
          method: 'DELETE'
        })
      },

      listWallets() {
        return request(`${baseUrl}/wallets`)
      },

      getPublicPoll(pollId) {
        return request(`${baseUrl}/polls/${encodeURIComponent(pollId)}/public`)
      },

      createInvoice(pollId, payload) {
        return request(`${baseUrl}/polls/${encodeURIComponent(pollId)}/invoice`, {
          method: 'POST',
          body: payload
        })
      },

      subscribePayment(paymentHash, callback) {
        return subscribePayment(paymentHash, callback)
      }
    }
  }

  function request(path, {method = 'GET', body = null} = {}) {
    const message = {
      action: 'api',
      method,
      path,
      body
    }

    return bridgeRequest(message)
      .then(unwrapRuntimeResponse)
      .catch(error => {
        logFailure('API request failed.', {method, path, body, error})
        throw error
      })
  }

  function bridgeRequest(message) {
    if (window.parent === window) {
      const error = new Error('LNbits extension bridge is not available.')
      logFailure('Bridge unavailable.', {message, error})
      return Promise.reject(error)
    }

    return getBridgePort()
      .then(port => bridgePortRequest(port, message))
      .catch(error => {
        if (message.action !== 'api') {
          logFailure('Bridge request failed.', {message, error})
        }
        throw error
      })
  }

  function getBridgePort() {
    if (!bridgePortPromise) {
      bridgePortPromise = connectBridge()
    }
    return bridgePortPromise
  }

  function connectBridge() {
    const id = requestId()
    const channel = new MessageChannel()
    const parentOrigin = bridgeParentOrigin()

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        channel.port1.removeEventListener('message', onMessage)
        channel.port1.close()
        const error = new Error('LNbits extension bridge timed out.')
        logFailure('Bridge connection timed out.', {id, error})
        reject(error)
      }, 30000)

      function onMessage(event) {
        if (event.currentTarget !== channel.port1) return

        const response = event.data
        if (
          !response ||
          response.type !== 'lnbits-extension:connected' ||
          response.id !== id
        ) {
          return
        }

        window.clearTimeout(timeout)
        channel.port1.removeEventListener('message', onMessage)
        attachBridgeEvents(channel.port1)
        resolve(channel.port1)
      }

      channel.port1.addEventListener('message', onMessage)
      channel.port1.start()
      window.parent.postMessage(
        {
          type: 'lnbits-extension:connect',
          id
        },
        parentOrigin,
        [channel.port2]
      )
    })
  }

  function bridgePortRequest(port, message) {
    const id = requestId()

    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        port.removeEventListener('message', onMessage)
        const error = new Error('LNbits extension bridge timed out.')
        logFailure('Bridge request timed out.', {id, message, error})
        reject(error)
      }, 30000)

      function onMessage(event) {
        if (event.currentTarget !== port) return

        const response = event.data
        if (
          !response ||
          response.type !== 'lnbits-extension:response' ||
          response.id !== id
        ) {
          return
        }

        window.clearTimeout(timeout)
        port.removeEventListener('message', onMessage)
        if (response.ok === false) {
          const error = new Error(response.error || 'Extension call failed.')
          logFailure('Bridge response failed.', {id, message, response, error})
          reject(error)
          return
        }
        resolve(response.data)
      }

      port.addEventListener('message', onMessage)
      port.postMessage({
        type: 'lnbits-extension:request',
        id,
        ...message
      })
    })
  }

  function attachBridgeEvents(port) {
    if (port.__lnbitsExtensionEventsAttached) return
    port.__lnbitsExtensionEventsAttached = true
    port.addEventListener('message', event => {
      if (event.currentTarget !== port) return
      const message = event.data
      if (!message || message.type !== 'lnbits-extension:event') return

      const handler = bridgeEventHandlers.get(message.subscriptionId)
      if (!handler) return
      handler(message)
    })
  }

  function subscribePayment(paymentHash, callback) {
    if (typeof callback !== 'function') {
      return Promise.reject(new Error('Payment subscription needs a callback.'))
    }

    const subscriptionId = requestId()
    bridgeEventHandlers.set(subscriptionId, callback)

    return bridgeRequest({
      action: 'payment.subscribe',
      subscriptionId,
      paymentHash
    })
      .then(() => {
        let active = true
        return () => {
          if (!active) return
          active = false
          bridgeEventHandlers.delete(subscriptionId)
          bridgeRequest({
            action: 'payment.unsubscribe',
            subscriptionId
          }).catch(error => {
            logFailure('Payment unsubscribe failed.', {subscriptionId, error})
          })
        }
      })
      .catch(error => {
        bridgeEventHandlers.delete(subscriptionId)
        logFailure('Payment subscription failed.', {
          paymentHash,
          subscriptionId,
          error
        })
        throw error
      })
  }

  function logFailure(message, details = {}) {
    if (!window.console || typeof window.console.error !== 'function') return
    window.console.error(LOG_PREFIX, message, details)
  }

  function requestId() {
    return (
      window.crypto?.randomUUID?.() ||
      `request_${Date.now()}_${Math.random().toString(36).slice(2)}`
    )
  }

  function bridgeParentOrigin() {
    return new URL(window.location.href).origin
  }

  function unwrapRuntimeResponse(value) {
    if (typeof value === 'string') {
      value = JSON.parse(value)
    }

    if (value && value.ok === false) {
      throw new Error(value.error || 'Extension call failed.')
    }

    if (value && value.ok === true && 'data' in value) {
      return value.data
    }

    return value
  }

  function errorMessage(value) {
    return value instanceof Error ? value.message : String(value)
  }

  window.createLNbitsExtensionClient = createLNbitsExtensionClient
})()
