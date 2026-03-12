<script setup>
defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: '',
  },
})
</script>

<template>
  <article class="content-card">
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
  </article>
</template>
