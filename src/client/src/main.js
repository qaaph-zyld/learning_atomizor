import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { createPinia } from 'pinia';
import store from './store';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';

// PrimeVue Components
import Button from 'primevue/button';
import Card from 'primevue/card';
import Chart from 'primevue/chart';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import ProgressBar from 'primevue/progressbar';

// Styles
import 'primevue/resources/themes/lara-light-blue/theme.css';
import 'primevue/resources/primevue.min.css';
import 'primeicons/primeicons.css';
import './assets/styles/main.scss';

const app = createApp(App);

// Use plugins
app.use(router);
app.use(createPinia());
app.use(store);
app.use(PrimeVue, { ripple: true });
app.use(ToastService);

// Register components
app.component('Button', Button);
app.component('Card', Card);
app.component('Chart', Chart);
app.component('DataTable', DataTable);
app.component('Column', Column);
app.component('InputText', InputText);
app.component('Textarea', Textarea);
app.component('ProgressBar', ProgressBar);

app.mount('#app');
