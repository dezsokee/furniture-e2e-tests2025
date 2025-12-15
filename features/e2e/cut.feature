@e2e
Feature: Cut Planner E2E behaviours

  Background:
    Given the application dev server is running
    And I am on the Cut Planner page

  Scenario: Page loads with default sheet dimensions
    Then the sheet width input should show 2000
    And the sheet height input should show 1000

  Scenario: Add element and shows it in summary
    When I click the Add Element button
    And I set the element width to 500
    And I set the element height to 300
    Then the elements list should contain 1 element
    And the summary should display the element details

  Scenario: Optimize successfully with one element
    When I click the Add Element button
    And I set the element width to 500
    And I set the element height to 300
    And I click the Optimize button
    Then the placements table should be visible
    And the placements table should contain 1 row
    And the backend should be called once

  Scenario: Show error when backend fails
    When I click the Add Element button
    And I set the element width to 500
    And the backend returns error "Invalid sheet dimensions"
    And I click the Optimize button
    Then the error message should be visible
    And the error message should contain "Invalid sheet dimensions"

  Scenario: Does not call backend when no elements
    When I click the Optimize button without adding elements
    Then the backend should not be called

  Scenario: SVG visualization appears after optimization
    When I click the Add Element button
    And I set the element width to 500
    And I set the element height to 300
    And I click the Optimize button
    Then the SVG visualization should be visible
    And the SVG should have viewBox "0 0 2000 1000"
    And the SVG should contain a sheet rectangle
    And the SVG should contain part rectangles

  Scenario: PNG export button is disabled when no placements
    Then the Export as PNG button should be disabled

  Scenario: PNG export button is enabled after optimization
    When I click the Add Element button
    And I set the element width to 500
    And I set the element height to 300
    And I click the Optimize button
    Then the Export as PNG button should be enabled

  Scenario: PNG export downloads file
    When I click the Add Element button
    And I set the element width to 500
    And I set the element height to 300
    And I click the Optimize button
    And I click the Export as PNG button
    Then a PNG file should be downloaded
