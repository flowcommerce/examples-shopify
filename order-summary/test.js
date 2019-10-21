/**
 *  @fileOverview Tests to confirm that image URL is present in output
 *
 *  @author       Santiago Böhmer
 *
 *  @requires     Node 11+
 *  @requires     Flow API key
 *  @requires     Mocha Test framework
 *  @requires     Chai Assertion Library
 * 
 * 
 *  Uses expect assertions to look for nested properties of JSON file, test cases are:
 *  1. Output should not include undefined image URL
 *  2. Output should not be blank URL
 * 
 *  To run the tests:
 *  ./node_modules/.bin/mocha test.js
 * 
 * 
 **/

const expect = require('chai').expect;

/** Change the referenced output file here */
const testData = require('./output/hundredPlus.json');



describe('tests output for present image URL', function () {

    testData.lines.forEach(function(lines)  { 
    it('output should not include "undefined" image Url', function () {
      expect(lines).to.not.have.nested.property('image.url', 'undefined' )
    });

  });

    testData.lines.forEach(function(lines)  { 
      it('output should include blank image Url', function () {
        expect(lines).to.not.have.nested.property('image.url', '' )
      });

    });
});


