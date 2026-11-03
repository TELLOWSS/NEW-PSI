import React from 'react';
import App from '../App';
import '../styles.css';
// R70: only admin platform inherits this scoped Field Canvas design layer.
import '../styles/psi-platform-field-canvas.css';
// R74-R77 operator-only secondary workspaces; never shared with public or worker routes.
import '../styles/psi-platform-workspaces.css';
import {DevModeProvider} from '../contexts/DevModeContext';
import {OperationalModeProvider} from '../contexts/OperationalModeContext';

/** Keep operational services, charts and authentication out of the public product entry. */
export default function OperationalApp() {
    return <OperationalModeProvider><DevModeProvider><App/></DevModeProvider></OperationalModeProvider>;
}
