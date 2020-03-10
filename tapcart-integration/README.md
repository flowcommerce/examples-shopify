# Tapcart Integration Guide
You may find it useful to review the basic integration guide for Shopify [Overview of Shopify Integrations](https://docs.flow.io/docs/integrate-with-shopify). For your custom integration with Flow, and more specifically Fashion Nova's existing Flow Organization, please refer to this guide which highlights the major pieces required:
- Estabilishing a Flow Experience
- Localizing Item Prices
- Redirecting to Flow Checkout UI

There will likely be more integration points than just these three and we can help flesh out this documentation as we get a better understanding of the scope of your custom integration.

## Establishing a Flow Experience
Every international shopping experience with Flow starts with establishing where the customer is located and creating a session based on that geolocation. When any customer hits the page without Flow session data saved, send a POST to https://api.flow.io/sessions/organizations/fashionnova-sandbox containing a session_form in the body:

```json
"session_form": {
  "fields": [
    { "name": "ip", "type": "string", "required": false, "description": "If specified, we will geolocate the user by this IP address, and if successful, select the experience matching the country of the IP address." , "annotations": ["personal_data"]},
    { "name": "experience", "type": "string", "required": false, "description": "If specified, we will render the items in the context of the experience with this key." },
    { "name": "country", "type": "string", "required": false, "description": "The ISO 3166-3 country code. Case insensitive. See https://api.flow.io/reference/countries", "example": "CAN" },
    { "name": "currency", "type": "string", "required": false, "description": "Iso 4217 3 currency code as defined in https://api.flow.io/reference/currencies If specified, translate the pricing to this currency. Translation occurs using the current spot rate for this currency from the base currency in the experience." },
    { "name": "language", "type": "string", "required": false, "description": "ISO 639 2 language code as defined in https://api.flow.io/reference/languages If specified, translate content to this language (where available)", "example": "en" },
    { "name": "locale", "type": "string", "required": false, "description": "Locale ID as defined in https://api.flow.io/reference/locales", "example": "en-US" },
    { "name": "attributes", "type": "map[string]", "required": false },
    { "name": "experiment", "type": "session_experiment_form", "required": false }
  ]
}
```

In response you should receive an organization_session:
```json
"organization_session": {
  "description": "Represents a session created for an organization. Primary method to select an experience for a given user session and ensure that experience does not change throughout the user's activity. Provides authentication to objects created during this session (e.g. order).",
  "fields": [
    { "name": "id", "type": "string" },
    { "name": "organization", "type": "string" },
    { "name": "visitor", "type": "session_visitor" },
    { "name": "visit", "type": "session_visit" },
    { "name": "environment", "type": "io.flow.common.v0.enums.environment", "description": "The Flow organization environment", "example": "sandbox" },
    { "name": "attributes", "type": "map[string]" },
    { "name": "ip", "type": "string", "required": false, "description": "The latest IP Address associated with this session, if known" , "annotations": ["personal_data"]},
    { "name": "local", "type": "local_session", "required": false },
    { "name": "geo", "type": "session_geo", "required": false, "description": "The geolocated information for this particular session. Note will always be present. Marked optional for backwards compatibility"},
    { "name": "experience", "type": "io.flow.experience.v0.models.experience_geo", "required": false, "description": "Present if the session maps to an enabled experience" },
    { "name": "format", "type": "session_format", "required": false },
    { "name": "experiment", "type": "session_experiment", "required": false }
  ]
},
```

Please cache this organization_session in the user's local storage. The most important piece of data returned here is the experience field. The experience is the value that Flow uses to determine which information to display to the user such as currency, pricing, tax, duties, availability, shipping options, payment options and more.

## Localizing Item Prices
Excerpt from [Display Localized Pricing - Server Side](https://docs.flow.io/docs/display-localized-pricing#section-server-side):
"All of the information from Flow is stored in a single String metafield. The data is compressed into a single value to ensure optimal performance when syncing information between Flow and Shopify. Since Shopify API enforces rate limits on how quickly it can provide data, having a single metafield per variant guarantees a deterministic amount of time to sync pricing information."

Below is the model of the metafield we store for each Shopify variant which can be retrieved from the Shopify API: 
```json
"shopify_variant_flow_metafield": {
    "description": "The shopify variant metafield defines the individual metafield values we write into Shopify for each variant. This model was introduced to enable server side rendering of content (e.g. the price on the product detail page). Each field in this model is available as its own metafield within a namespace named 'price_abc' where abc is a unique, short identifier for an experience.",
    "fields": [
        {
            "name": "prices_item",
            "type": "string",
            "description": "The item price in local currency",
            "example": "C$150.95"
        },
        {
            "name": "prices_currency",
            "type": "string",
            "description": "ISO 4217 3 currency code in upper case of the item price",
            "example": "CAD"
        },
        { 
            "name": "prices_includes",
            "type": "string",
            "required": false,
            "description": "Defines what is included in the item price",
            "example": "Includes VAT" 
        },
        { 
            "name": "prices_vat",
            "type": "string",
            "required": false,
            "description": "The VAT in local currency",
            "example": "C$20.00" 
        },
        { 
            "name": "prices_vat_name",
            "type": "string",
            "required": false,
            "description": "The name of the VAT for this experience country",
            "example": "VAT or HST"
        },
        { 
            "name": "prices_duty",
            "type": "string",
            "required": false,
            "description": "The Duty in local currency",
            "example": "C$10.00" 
        },
        { 
            "name": "prices_compare_at",
            "type": "string",
            "required": false,
            "description": "The compare at item price in local currency",
            "example": "C$250.00" 
        },
        { 
            "name": "prices_status",
            "type": "io.flow.catalog.v0.enums.subcatalog_item_status",
            "description": "Indicates whether the variant should be included or excluded from being sold in the experience."
        },
        { 
            "name": "inventory_status",
            "type": "io.flow.fulfillment.v0.enums.item_availability_status",
            "required": false,
            "description": "The inventory availability for the variant. Can be used to make decisions on how to present products to customers based on inventory condition" 
        }
    ]
}
```

Here are the possible subcatalog item statuses:
```json
"subcatalog_item_status": {
    "description": "Status indicating availability of a subcatalog item in an experience.",
    "values": [
        {
            "name": "excluded",
            "description": "The user has chosen to exclude the item from the associated subcatalog." 
        },
        { 
            "name": "included",
            "description": "The item is included in the associated subcatalog." 
        },
        { 
            "name": "restricted",
            "description": "Item is not allowed to be sold in the market associated with the given subcatalog." 
        }
    ]
}
```

Here are the possible item availability statuses:
```json
"item_availability_status": {
    "values": [
        {
            "name": "available",
            "description": "Inventory is generally available for purchase" 
        },
        {
            "name": "low",
            "description": "Inventory is low and may soon become unavailable for purchase (# inventory items <= 5). Unless there is a specific use case for low inventory, it can be treated the same as 'available'" 
        },
        {
            "name": "out_of_stock",
            "description": "There is no inventory available and is not available for purchase. Sample actions that can be taken are hiding the item or marking as `sold out` on the frontend" 
        }
    ]
}
```

## Redirecting to Flow Checkout UI
Sending users with a Shopify cart to Flow Checkout UI is done with our Shopify cart conversion API. POST to https://api.flow.io/fashionnova-sandbox/experiences/${experience}/shopify/cart/checkouts containing a shopify_cart object in the body which can be pull from Shopify API and replacing the experience token with the active session experience for the user being redirected. This experience value should already be stored from the geolocation step earlier.

Below is a reflection of the Shopify objects expected for this checkout redirect to work properly:
```json
"shopify_cart": {
  "description": "Representation of a Shopify cart exactly as defined by shopify.com",
  "fields": [
    { "name": "id", "type": "string", "description": "Equivalent of the cart token" },
    { "name": "items", "type": "[shopify_cart_item]" },
    { "name": "item_count", "type": "long" },
    { "name": "total_price", "type": "long" },
    { "name": "local", "type": "shopify_local_cart_metadata" },
    { "name": "attributes", "type": "object", "required": false },
    { "name": "note", "type": "string", "required": false },
    { "name": "requires_shipping", "type": "boolean", "default": true },
    { "name": "total_weight", "type": "long", "required": false }
  ]
},

"shopify_cart_item": {
  "fields": [
    { "name": "id", "type": "string" },
    { "name": "handle", "type": "string" },
    { "name": "line_price", "type": "double" },
    { "name": "price", "type": "long" },
    { "name": "product_id", "type": "long" },
    { "name": "product_title", "type": "string" },
    { "name": "quantity", "type": "long" },
    { "name": "title", "type": "string" },
    { "name": "url", "type": "string" },
    { "name": "variant_id", "type": "long" },
    { "name": "local", "type": "shopify_local_cart_item_metadata" },
    { "name": "gift_card", "type": "boolean", "default": false },
    { "name": "image", "type": "string", "required": false },
    { "name": "product_description", "type": "string", "required": false },
    { "name": "product_type", "type": "string", "required": false },
    { "name": "properties", "type": "map[string]", "required": false },
    { "name": "requires_shipping", "type": "boolean", "default": true },
    { "name": "sku", "type": "string", "required": false },
    { "name": "variant_title", "type": "string", "required": false },
    { "name": "variant_options", "type": "[string]", "required": false },
    { "name": "vendor", "type": "string", "required": false }
  ]
},

"shopify_local_cart_metadata": {
  "fields": [
    { "name": "total_price", "type": "io.flow.common.v0.models.price_with_base" },
    { "name": "promotions", "type": "io.flow.experience.v0.models.promotions", "description": "The current available and applied promotions for this order" },
    { "name": "rules", "type": "io.flow.experience.v0.models.order_rules_summary", "required": false, "description": "Represents a summary of the rules related to this cart." },
    { "name": "subtotal", "type": "io.flow.common.v0.models.price_with_base" },
    { "name": "vat", "type": "io.flow.common.v0.models.price_with_base", "required": false },
    { "name": "duty", "type": "io.flow.common.v0.models.price_with_base", "required": false },
    { "name": "discount", "type": "io.flow.common.v0.models.price_with_base", "required": false }
  ]
},

"shopify_local_cart_item_metadata": {
  "fields": [
    { "name": "line_price", "type": "io.flow.common.v0.models.price_with_base" },
    { "name": "price", "type": "io.flow.common.v0.models.price_with_base" }
  ]
}
```
