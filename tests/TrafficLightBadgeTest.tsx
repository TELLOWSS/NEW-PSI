/**
 * Test page for TrafficLightBadge component
 * This page demonstrates all the different states of the TrafficLightBadge
 */

import React from 'react';
import { TrafficLightBadge } from '../components/shared/TrafficLightBadge';

export const TrafficLightBadgeTest: React.FC = () => {
    return (
        <div className="p-8 bg-slate-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-8 text-slate-800">TrafficLightBadge Component Test</h1>
            
            <div className="space-y-8">
                {/* Red Tests */}
                <section className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-red-700">🔴 Red States</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Low confidence (0.5) + Low risk</p>
                            <TrafficLightBadge confidence={0.5} riskLevel="Low" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">High confidence (0.95) + High risk</p>
                            <TrafficLightBadge confidence={0.95} riskLevel="High" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Low confidence (0.3) + High risk</p>
                            <TrafficLightBadge confidence={0.3} riskLevel="High" />
                        </div>
                    </div>
                </section>

                {/* Yellow Tests */}
                <section className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-yellow-700">🟡 Yellow States</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.7 + Low risk</p>
                            <TrafficLightBadge confidence={0.7} riskLevel="Low" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.8 + Medium risk</p>
                            <TrafficLightBadge confidence={0.8} riskLevel="Medium" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.89 + Low risk</p>
                            <TrafficLightBadge confidence={0.89} riskLevel="Low" />
                        </div>
                    </div>
                </section>

                {/* Green Tests */}
                <section className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-green-700">🟢 Green States</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.9 + Low risk</p>
                            <TrafficLightBadge confidence={0.9} riskLevel="Low" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.95 + Medium risk</p>
                            <TrafficLightBadge confidence={0.95} riskLevel="Medium" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 1.0 + Low risk</p>
                            <TrafficLightBadge confidence={1.0} riskLevel="Low" />
                        </div>
                    </div>
                </section>

                {/* Interactive Test */}
                <section className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-slate-800">🎯 Interactive Test</h2>
                    <p className="text-sm text-slate-600 mb-4">Click on any badge to approve it (turns green)</p>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Start as Red (confidence 0.6, High risk)</p>
                            <TrafficLightBadge 
                                confidence={0.6} 
                                riskLevel="High" 
                                onClick={() => console.log('Badge approved!')}
                            />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Start as Yellow (confidence 0.8, Medium risk)</p>
                            <TrafficLightBadge 
                                confidence={0.8} 
                                riskLevel="Medium" 
                                onClick={() => console.log('Badge approved!')}
                            />
                        </div>
                    </div>
                </section>

                {/* Edge Cases */}
                <section className="bg-white p-6 rounded-lg shadow">
                    <h2 className="text-xl font-bold mb-4 text-slate-800">⚠️ Edge Cases</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0 + Low risk</p>
                            <TrafficLightBadge confidence={0} riskLevel="Low" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.699 (just below yellow threshold)</p>
                            <TrafficLightBadge confidence={0.699} riskLevel="Low" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-600 mb-2">Confidence 0.899 (just below green threshold)</p>
                            <TrafficLightBadge confidence={0.899} riskLevel="Low" />
                        </div>
                    </div>
                </section>
            </div>

            <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h3 className="font-bold text-blue-900 mb-2">Color Logic Rules:</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>🔴 <strong>Red:</strong> confidence &lt; 0.7 OR riskLevel == 'High'</li>
                    <li>🟡 <strong>Yellow:</strong> 0.7 ≤ confidence &lt; 0.9</li>
                    <li>🟢 <strong>Green:</strong> confidence ≥ 0.9 AND riskLevel != 'High'</li>
                    <li>✅ <strong>Approved:</strong> After clicking, badge turns green with "Approved" label</li>
                </ul>
            </div>
        </div>
    );
};
