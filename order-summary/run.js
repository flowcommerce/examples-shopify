/**
 *  @fileOverview Reads Shopify Order webhook response JSON files from the filesystem, converts them to
 *  Flow `OrderSummary` objects from the Flow API and writes the data back into separate JSON files.
 *
 *  @author       Matt Kersner
 *  @author       John Bell
 *
 *  @requires     Node 11+
 *  @requires     Flow API key
 */

const fs = require('fs')
const https = require('https')
const path = require('path')

/** 'Samples' is the directory containing the input JSON files. Directory read from can be changed here. */
const inputDirName = 'samples_large'
const orderFilesDirectory = path.resolve(__dirname, inputDirName)

/**
 * Takes 100 Shopify variant IDs and returns Flow Items. These are used to retrieve additional
 * information such as images, which is required for the Order Summary object.
 * We provide an implementation which retrieves this data from api.flow.io, however it can be
 * customized to suit your needs. The only requirement is that it returns an `Item` model from Flow.
 *
 * @param {array} variantIDs
 *
 * @returns {Promise<object[]>} JSON data of requested variants
 */
function makeFlowAPICall(variantIDs) {
  return new Promise((resolve, reject) => {
    const flowAPIKey = 'HlGgfflLamiTQJ'
    const q = variantIDs.map(x => `number=${x}`).join('&')

    const options = {
      host: 'api.flow.io',
      path: `/playground/catalog/items?${q}&limit=100`,
      method: 'GET',
      json: true,
      resolveWithFullResponse: true,
      headers: {
        'Authorization': 'Basic ' + new Buffer.from(flowAPIKey + ':').toString('base64'),
      }
    }

    const req = https.request(options, (res) => {
      let responseJson = ''
      res.on('data', (chunk) => {
        responseJson += chunk
      })
      res.on('end', () => {
        resolve(JSON.parse(responseJson))
      })
    })
    req.on('error', (error) => {
      console.error(error)
      reject(error)
    })
    req.end()
  })
}

/**
 *  There is no reason
 *  to edit any code 
 *  beyond this comment.
 */

/** Helper to flatten response data when > 100 objects  */
function flattenResponse(response) {
  const flatObject = []
  response.forEach(arrayOf100 => {
    arrayOf100.forEach(obj => {
      flatObject.push(obj)
    })
  })
  return flatObject
}

 /** Helper function to break total number of Variant IDs into 100 ID chunks */
async function getFlowItemFromVariant(variantIDs) {
  const apiCallPromises = []
  for (let i = 0; i < variantIDs.length; i += 100) {
    apiCallPromises.push(makeFlowAPICall(variantIDs.slice(i, i + 100)))
  }
  const flowObjects = await Promise.all(apiCallPromises)
  const flatResponse = flattenResponse(flowObjects)
  return flatResponse
}

/** Loop through all the files in the input directory and parse order. */
fs.readdir(inputDirName, function (err, files) {
  if (err) {
    console.error('Could not list the directory.', err)
    process.exit(1)
  }

  files.forEach(async function (file, index) {
    console.log(`Reading ${inputDirName}/${file} ===> output/${file}`)
    let rawdata = fs.readFileSync(`${orderFilesDirectory}/${file}`)
    let order = JSON.parse(rawdata)
    const completedOrder = await parseOrder(order, getFlowItemFromVariant)
    let data = JSON.stringify(completedOrder)
    fs.writeFileSync(`./output/${file}`, data)
  })
})

/** Helper to pull the url from the api data based on variant id */
function getURLforID(id, apiData) {
  const currentItem = apiData.find(o => o.number == id)
  let url
  if (currentItem){
    const imageWithCheckoutTag = currentItem.images.find(function(image){
      return image.tags.includes('checkout')
    })

    if (imageWithCheckoutTag){
      url = imageWithCheckoutTag.url
    } else {
      const firstImage = currentItem.images[0]
      if (firstImage){
        url = firstImage.url
      }
    }
  }
  return url 
}

/** Parses Shopify webhook response JSON into Flow order summary */
async function parseOrder(order, fnVariantToFlowItem) {
  const variantIDs = order.line_items.map(line => line.variant_id)
  const items = await fnVariantToFlowItem(variantIDs)
  const currency = order.currency
  const orderSummaryBody = {}
  const subtotal = {
    price: {
      amount: order.subtotal_price,
      currency: currency,
      label: '$' + order.subtotal_price,
    },
    name: 'subtotal',
  }
  const discount = {
    price: {
      amount: order.total_discounts,
      currency: currency,
      label: '$' + order.total_discounts,
    },
    name: 'discount',
  }
  const total = {
    price: {
      amount: order.total_price,
      currency: currency,
      label: '$' + order.total_price,
    },
    name: 'total',
  }
  const shipping = {
    price: {
      amount: order.total_shipping_price_set.shop_money.amount,
      currency: currency,
      label: '$' + order.total_shipping_price_set.shop_money.amount,
    },
    name: 'shipping',
  }
  const tax = {
    price: {
      amount: order.total_tax,
      currency: currency,
      label: '$' + order.total_tax,
    },
    name: 'tax',
  }
  const duty = order.tax_lines.find(function (line) {
    return line.title == 'Duty'
  })
  const lines = order.line_items.map(function (line) {
    const attributes = line.properties.map(function (property) {
      return {
        key: property.name,
        name: property.name,
        value: property.value,
      }
    })
    const tax = line.tax_lines.find(function (taxLine) {
      return taxLine.title.includes('Tax') || taxLine.title.includes('tax')
    })

    const lineData = {
      item: {
        number: line.variant_id,
      },
      name: line.name,
      attributes: attributes,
      quantity: line.quantity,
      line: {
        price: {
          amount: line.price,
          currency: currency,
          label: '$' + line.price,
        },
        total: {
          amount: line.price * line.quantity,
          currency: currency,
          label: '$' + (line.price * line.quantity),
        },
        discount: {
          amount: line.total_discount,
          currency: currency,
          label: '$' + line.total_discount,
        },
        tax: {
          rate: tax ? tax.rate : '',
          value: {
            amount: tax ? tax.price : '',
            currency: currency,
            label: tax ? '$' + tax.price : '',
          },
        },
      },
      image: {
        url: getURLforID(line.variant_id, items)
      }
    }

    if (!tax) {
      delete lineData.line.tax
    }

    return lineData
  })

  if (duty) {
    orderSummaryBody.duty = duty
  }

  orderSummaryBody.shipping = shipping
  orderSummaryBody.subtotal = subtotal
  orderSummaryBody.tax = tax
  orderSummaryBody.total = total
  orderSummaryBody.lines = lines
  orderSummaryBody.discount = discount

  return orderSummaryBody
}