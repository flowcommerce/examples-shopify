const fs = require('fs');
var path = require('path');

// Loop through all the files in the temp directory
fs.readdir("./samples", function (err, files) {
  if (err) {
    console.error("Could not list the directory.", err);
    process.exit(1);
  }

  files.forEach(function (file, index) {
    console.log('FILE ===>', file, index);
    let rawdata = fs.readFileSync(`./samples/${file}`);
    let order = JSON.parse(rawdata);

    let data = JSON.stringify(parseOrder(order));
    fs.writeFileSync(`./output/${file}`, data);
  });
});



function parseOrder(order, fetchImg()) {
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
  const duty = order.tax_lines.find(function(line) {
    return line.title == "Duty";
  });
  const lines = order.line_items.map(function(line) {
    const attributes = line.properties.map(function(property) {
      return {
        key: property.name,
        name: property.name,
        value: property.value,
      }
    });
    const tax = line.tax_lines.find(function(taxLine) {
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
        }
      },
      image: {
        url : fetchImg();
      } 
    }

    if(!tax) {
      delete lineData.unit.tax;
      delete lineData.line.tax;
    }

    return lineData;
  });

  if(duty) {
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