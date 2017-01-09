//This is to use AMD if we are running require.js 
(function (factory){
(function(window,document,navigator,$,ko,Spinner,undefined){
!function(factory) {    
    if (typeof define === 'function' && define.amd) {
        define(['exports','jquery','knockout'],factory);
    }
    else {
        factory(window['DataGrid'] = {},$,ko,Spinner);   
    }
}(function(exports,$,ko) {

    ko.chuchoGrid = {
        // Defines a view model class you can use to populate a grid
        viewModel: function (configuration) {
            this.data = configuration.data;
            this.columns = configuration.columns;
            this.sortedCol = configuration.sortedCol;
        }
    };

    // Templates used to render the grid
    var templateEngine = new ko.jqueryTmplTemplateEngine();
    templateEngine.addTemplate("ko_chuchoGrid_grid", "\
                    <table class=\"chucho-grid table table-borded\" cellspacing=\"0\">\
                        <thead>\
                            <tr>\
                                {{each(i, columnDefinition) columns}}\
                                    <th data-bind=\"sortHandler: columnDefinition\">\
                                        {{if sortedCol()['column'] === columnDefinition.id && sortedCol()['asc'] === true}}\
                                            ${ columnDefinition.name } <span class=\"glyphicon glyphicon-chevron-up\"></span>\
                                        {{else sortedCol()['column'] === columnDefinition.id && sortedCol()['asc'] === false}}\
                                            ${ columnDefinition.name } <span class=\"glyphicon glyphicon-chevron-down\"></span>\
                                        {{else}}\
                                            ${ columnDefinition.name }\
                                        {{/if}}\
                                    </th>\
                                {{/each}}\
                            </tr>\
                        </thead>\
                        <tbody>\
                            {{each(i, row) data}}\
                                <tr data-row=\"${i}\" data-bind=\"clickHandler: i\"  class=\"${ i % 2 == 0 ? 'odd' : 'even' }\">\
                                    {{each(j, columnDefinition) columns}}\
                                        <td>{{html typeof columnDefinition.formatter == 'function' ? \
                                              columnDefinition.formatter(row, columnDefinition.field, i, j) : row[columnDefinition.field] }}</td>\
                                    {{/each}}\
                                </tr>\
                            {{/each}}\
                        </tbody>\
                    </table>");

    // The "chuchoGrid" binding
    ko.bindingHandlers.chuchoGrid = {
        // This method is called to initialize the node, and will also be called again if you change what the grid is bound to
        update: function (element, viewModelAccessor, allBindingsAccessor) {
            var viewModel = viewModelAccessor(), allBindings = allBindingsAccessor();
            
            // Empty the element
            while(element.firstChild)
                ko.removeNode(element.firstChild);

            // Allow the default templates to be overridden
            var gridTemplateName = allBindings.chuchoGridTemplate || "ko_chuchoGrid_grid";

            // Render the main grid
            var gridContainer = element.appendChild(document.createElement("DIV"));
            ko.renderTemplate(gridTemplateName, viewModel, { templateEngine: templateEngine }, gridContainer, "replaceNode");
        }
    };
});
})(window,document,navigator,window["$"],window["ko"]);
})();
