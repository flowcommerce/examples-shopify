const fs = require('fs');
const https = require('https');
var path = require('path');

// Loop through all the files in the temp directory
fs.readdir("./samples", function (err, files) {
  if (err) {
    console.error("Could not list the directory.", err);
    process.exit(1);
  }

  files.forEach(async function (file, index) {
    console.log('FILE ===>', file, index);
    let rawdata = fs.readFileSync(`./samples/${file}`);
    let order = JSON.parse(rawdata);
    const completedOrder = await parseOrder(order)
    let data = JSON.stringify(completedOrder, fetchImgFromFlow());
    fs.writeFileSync(`./output/${file}`, data);
  });
});

function fetchImgFromFlow(variant_id) {
  // console.log(variant_id)
  return new Promise ((resolve,rej)=> {
    const flowAPIKey = "HlGgfflLamiTQJ"
    const options = {
      host: "api.flow.io",
      path: `/playground/catalog/items?number=${variant_id}`,
      method: "GET",
      headers: {
        "Authorization": "Basic " + new Buffer(flowAPIKey + ":").toString("base64"),
      }
    }
    
    const req = https.request(options, (res) => {
      
      res.on('data', (d) => {
        d = d.toString('utf8')
        d = JSON.parse(d)
        resolve(d[0])
      })
    })
    
    req.on('error', (error) => {
      // console.error(error)
    })
    
    req.end()
  })
}

//helper to pull the url from the api data based on variant id
function getURLforID(id, apiData){
  let url = apiData.find(o => o.number == id )
  // console.log(url.images[0].url)
  return (url.images[0].url)
}

async function parseOrder(order, fetchImg) {

  // 1. GET LIST OF vartiant ids, aka the item_numbers from order.lines
  let variantIDs = []
  order.line_items.forEach(function (line){
    variantIDs.push(line.variant_id)
  })

  // 3. const hydratedItems = await on Promise.all(Array<Promise<Item>>)
  // 3.1 Create lookup function against hydratedItems, getItemImageUrl(item_number)... use Array.find...
  const itemPromises = variantIDs.map(id => fetchImgFromFlow(id)) 
  const items = await Promise.all(itemPromises);

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
    price: {
      amount: order.total_shipping_price_set.shop_money.amount,
      currency: currency,
      label: "$" + order.total_shipping_price_set.shop_money.amount,
    },
    name: "shipping",
  };
  const tax = {
    price: {
      amount: order.total_tax,
      currency: currency,
      label: "$" + order.total_tax,
    },
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
      }
    });
    const tax = line.tax_lines.find(function (taxLine) {
      return taxLine.title.includes('Tax') || taxLine.title.includes('tax');
    });

    const lineData = {
      item: {
        number: line.variant_id,
      },
      name: line.name,
      attributes: attributes,
      quantity: line.quantity,
      unit: {
        price: {
          amount: line.price,
          currency: currency,
          label: "$" + line.price,
        },
        total: {
          amount: line.price,
          currency: currency,
          label: "$" + line.price,
        },
        discount: {
          amount: line.total_discount,
          currency: currency,
          label: "$" + line.total_discount,
        },
        tax: {
          rate: tax ? tax.rate : "",
          value: {
            amount: tax ? tax.price : "",
            currency: currency,
            label: tax ? "$" + tax.price : "",
          },
        }
      },
      line: {
        price: {
          amount: line.price,
          currency: currency,
          label: "$" + line.price,
        },
        total: {
          amount: line.price * line.quantity,
          currency: currency,
          label: "$" + (line.price * line.quantity),
        },
        discount: {
          amount: line.total_discount,
          currency: currency,
          label: "$" + line.total_discount,
        },
        tax: {
          rate: tax ? tax.rate : "",
          value: {
            amount: tax ? tax.price : "",
            currency: currency,
            label: tax ? "$" + tax.price : "",
          },
        },
      },
      image: {
        url: getURLforID(line.variant_id, items)
      }
    }

    if (!tax) {
      delete lineData.unit.tax;
      delete lineData.line.tax;
    }

    return lineData;
  });

  if (duty) {
    orderSummaryBody.duty = duty;
  }

  // if(insurance) {
  //   orderSummaryBody.insurance = insurance;
  // }

  // if(surcharges) {
  //   orderSummaryBody.surcharges = surcharges;
  // }

  orderSummaryBody.shipping = shipping;
  orderSummaryBody.subtotal = subtotal;
  orderSummaryBody.tax = tax;
  orderSummaryBody.total = total;
  orderSummaryBody.lines = lines;
  orderSummaryBody.discount = discount;

  return orderSummaryBody;
};