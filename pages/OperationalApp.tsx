import React from 'react';
import App from '../App';
import '../styles.css';
import {DevModeProvider} from '../contexts/DevModeContext';
import {OperationalModeProvider} from '../contexts/OperationalModeContext';

/** Keep operational services, charts and authentication out of the public product entry. */
export default function OperationalApp() {
    return <OperationalModeProvider><DevModeProvider><App/></DevModeProvider></OperationalModeProvider>;
}
