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

const https = require("https");

import getConfig from "../config";
import "../typedef";

//TODO: Figure this out
const config = getConfig("dev");

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
    const flowAPIKey = config.flow.apiKey;
    const q = variantIDs.map(x => `number=${x}`).join("&");

    const options = {
      host: "api.flow.io",
      path: `/${config.flow.org}/catalog/items?${q}&limit=100`,
      method: "GET",
      json: true,
      resolveWithFullResponse: true,
      headers: {
        Authorization: "Basic " + new Buffer.from(flowAPIKey + ":").toString("base64"),
      },
    };

    const req = https.request(options, res => {
      let responseJson = "";
      res.on("data", chunk => {
        responseJson += chunk;
      });
      res.on("end", () => {
        resolve(JSON.parse(responseJson));
      });
    });
    req.on("error", error => {
      console.error(error);
      reject(error);
    });
    req.end();
  });
}

/**
 *  There is no reason
 *  to edit any code
 *  beyond this comment.
 */

/** Helper function to break total number of Variant IDs into 100 ID chunks */
async function fetchVariants(variantIDs) {
  const apiCallPromises = [];
  for (let i = 0; i < variantIDs.length; i += 100) {
    apiCallPromises.push(makeFlowAPICall(variantIDs.slice(i, i + 100)));
  }
  const flowObjects = await Promise.all(apiCallPromises);
  return [].concat(...flowObjects);
}

function getCompareAtForVariantId(id, apiData) {
  const currentItem = apiData.find(o => o.number == id);
  if (currentItem) {
    const compare_at = currentItem.attributes.compare_at;
    if (compare_at) {
      return parseFloat(compare_at);
    }
    return currentItem.price;
  } else {
    return 0;
  }
}

/** Helper to pull the url from the api data based on variant id */
function getImageUrlForVariantId(id, apiData) {
  const currentItem = apiData.find(o => o.number == id);
  let url;
  if (currentItem) {
    const imageWithCheckoutTag = currentItem.images.find(function (image) {
      return image.tags.includes("checkout");
    });

    if (imageWithCheckoutTag) {
      url = imageWithCheckoutTag.url;
    } else {
      const firstImage = currentItem.images[0];
      if (firstImage) {
        url = firstImage.url;
      }
    }
  }
  return url;
}

/** Helper to pull the product url from the api data based on variant id */
function getProductUrlForVariantId(id, apiData) {
  const currentItem = apiData.find(o => o.number == id);
  if (currentItem) {
    const url = currentItem.attributes.url;

    return url;
  }
  return "";
}

function toUsdPrice(amount) {
  const val = parseFloat(amount);
  return {
    amount: val,
    currency: "USD",
    label: "$" + val.toFixed(2),
  };
}

/** Parses Shopify webhook response JSON into Flow order summary */

/**
 * Parses an order into a OrderSummary
 *
 * @export
 * @param {Order} order
 * @returns {FlowOrderSummary}
 */
export async function parseOrder(order) {
  const variantIDs = order.line_items.map(line => line.variant_id);
  const items = await fetchVariants(variantIDs);

  const currency = order.currency;
  const orderSummaryBody = {};
  const subtotal = {
    price: {
      amount: order.subtotal_price,
      currency: currency,
      label: "$" + order.subtotal_price,
    },
    name: "subtotal",
  };
  const discount = {
    price: {
      amount: order.total_discounts,
      currency: currency,
      label: "$" + order.total_discounts,
    },
    name: "discount",
  };
  const total = {
    price: {
      amount: order.total_price,
      currency: currency,
      label: "$" + order.total_price,
    },
    name: "total",
  };
  const shipping = {
    price: toUsdPrice(order.total_shipping_price_set.shop_money.amount),
    name: "shipping",
  };
  const tax = {
    price: toUsdPrice(order.total_tax),
    name: "tax",
  };

  const duty = order.tax_lines.find(function (line) {
    return line.title == "Duty";
  });
  const lines = order.line_items.map(function (line) {
    const attributes = line.properties.map(function (property) {
      return {
        key: property.name,
        name: property.name,
        value: property.value,
      };
    });

    // item.price_set.presentment_money.amount != item.pre_tax_price_set.presentment_money.amount
    const compare_at = getCompareAtForVariantId(line.variant_id, items);
    const price_attributes = {
      compare_at: toUsdPrice(compare_at * line.quantity),
    };

    const tax = line.tax_lines.find(function (taxLine) {
      return taxLine.title.toLowerCase().includes("tax");
    });

    const lineData = {
      item: {
        number: line.variant_id,
        name: line.name,
        attributes: attributes,
        image: {
          url: getImageUrlForVariantId(line.variant_id, items),
        },
        compare_at: toUsdPrice(compare_at),

        price: toUsdPrice(line.price),
        total: toUsdPrice(line.price),
        discount: toUsdPrice(line.total_discount),
        tax: {
          rate: tax ? tax.rate : "",
          value: toUsdPrice(tax ? tax.price : 0),
        },
      },
      price_attributes: price_attributes,
      quantity: line.quantity,
      price: toUsdPrice(line.price),
      total: toUsdPrice(line.price * line.quantity),
      discount: toUsdPrice(line.total_discount),
      tax: {
        rate: tax ? tax.rate : "",
        value: toUsdPrice(tax ? tax.price : 0),
      },
    };

    if (!tax) {
      delete lineData.item.tax;
      delete lineData.line.tax;
    }

    return lineData;
  });

  if (duty) {
    orderSummaryBody.duty = duty;
  }

  orderSummaryBody.discount = discount;
  orderSummaryBody.lines = lines;
  orderSummaryBody.shipping = shipping;
  orderSummaryBody.subtotal = subtotal;
  orderSummaryBody.tax = tax;
  orderSummaryBody.total = total;

  return orderSummaryBody;
}
