# {{ componentName }}

## Description
{{ description }}

## Props

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
{{#each props}}
| {{ name }} | {{ type }} | {{ required }} | {{ default }} | {{ description }} |
{{/each}}

## Events

| Name | Parameters | Description |
|------|------------|-------------|
{{#each events}}
| {{ name }} | {{ parameters }} | {{ description }} |
{{/each}}

## Methods

| Name | Parameters | Returns | Description |
|------|------------|---------|-------------|
{{#each methods}}
| {{ name }} | {{ parameters }} | {{ returns }} | {{ description }} |
{{/each}}

## Examples

### Basic Usage
```vue
{{ basicExample }}
```

### Advanced Usage
```vue
{{ advancedExample }}
```

## Notes
{{ notes }}

## Related Components
{{#each relatedComponents}}
- [{{ name }}]({{ link }})
{{/each}}
