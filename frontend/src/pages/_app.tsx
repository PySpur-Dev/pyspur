import React from 'react';
import { Provider } from 'react-redux';
import { NextUIProvider } from '@nextui-org/react';
import { AppProps } from 'next/app';
import store from '../store/store';
import '../styles/globals.css';
import '../styles/components.css';
import { ThemeProvider as NextThemesProvider } from "next-themes";

const MyApp: React.FC<AppProps> = ({ Component, pageProps }) => {
  return (
    <Provider store={store}>
      <NextUIProvider>
        <NextThemesProvider attribute="class" defaultTheme="dark">
          <Component {...pageProps} />
        </NextThemesProvider>
      </NextUIProvider>
    </Provider>
  );
}

export default MyApp;
